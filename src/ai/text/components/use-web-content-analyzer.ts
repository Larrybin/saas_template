import { useTranslations } from 'next-intl';
import { useCallback, useReducer, useState } from 'react';
import { toast } from 'sonner';
import {
  classifyError,
  ErrorSeverity,
  ErrorType,
  logError,
  WebContentAnalyzerError,
  withRetry,
} from '@/ai/text/utils/error-handling';
import { logAnalyzerComponentError } from '@/ai/text/utils/error-logging.client';
import type {
  AnalysisState,
  AnalyzeContentResponse,
  ModelProvider,
} from '@/ai/text/utils/web-content-analyzer';
import { useAiErrorUi } from '@/hooks/use-ai-error-ui';
import {
  handleAuthFromEnvelope,
  useAuthErrorHandler,
} from '@/hooks/use-auth-error-handler';
import { getDomainErrorMessage } from '@/lib/domain-error-utils';

type AnalysisAction =
  | { type: 'START_ANALYSIS'; payload: { url: string } }
  | { type: 'SET_LOADING_STAGE'; payload: { stage: 'scraping' | 'analyzing' } }
  | {
      type: 'SET_RESULTS';
      payload: { results: AnalysisState['results']; screenshot?: string };
    }
  | { type: 'SET_ERROR'; payload: { error: string } }
  | { type: 'RESET' };

function analysisReducer(
  state: AnalysisState,
  action: AnalysisAction
): AnalysisState {
  switch (action.type) {
    case 'START_ANALYSIS':
      return {
        ...state,
        url: action.payload.url,
        isLoading: true,
        loadingStage: 'scraping',
        results: null,
        error: null,
        screenshot: undefined,
      };
    case 'SET_LOADING_STAGE':
      return {
        ...state,
        loadingStage: action.payload.stage,
      };
    case 'SET_RESULTS':
      return {
        ...state,
        isLoading: false,
        loadingStage: null,
        results: action.payload.results,
        screenshot: action.payload.screenshot,
        error: null,
      };
    case 'SET_ERROR':
      return {
        ...state,
        isLoading: false,
        loadingStage: null,
        error: action.payload.error,
      };
    case 'RESET':
      return {
        url: '',
        isLoading: false,
        loadingStage: null,
        results: null,
        error: null,
        screenshot: undefined,
      };
    default:
      return state;
  }
}

const ANALYZE_STAGE_MIN_DELAY_MS = 1000;

const initialState: AnalysisState = {
  url: '',
  isLoading: false,
  loadingStage: null,
  results: null,
  error: null,
  screenshot: undefined,
};

export function useWebContentAnalyzer() {
  const [state, dispatch] = useReducer(analysisReducer, initialState);
  const [modelProvider, setModelProvider] =
    useState<ModelProvider>('openrouter');
  const [analyzedError, setAnalyzedError] =
    useState<WebContentAnalyzerError | null>(null);
  const t = useTranslations();
  const translate = useCallback(
    (key: string) => t(key as Parameters<typeof t>[0]),
    [t]
  );
  const handleAuthError = useAuthErrorHandler();
  const { handleAiError } = useAiErrorUi();

  const handleAnalyzeUrl = useCallback(
    async (url: string, provider: ModelProvider) => {
      dispatch({ type: 'START_ANALYSIS', payload: { url } });
      setAnalyzedError(null);

      try {
        const result = await withRetry(async () => {
          const response = await fetch('/api/analyze-content', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url, modelProvider: provider }),
          });

          const data: AnalyzeContentResponse = await response.json();

          if (response.status === 401) {
            handleAuthFromEnvelope(handleAuthError, {
              code: data.code,
              error: data.error,
            });
          }

          if (!response.ok) {
            let errorType = ErrorType.UNKNOWN;
            let severity = ErrorSeverity.MEDIUM;
            let retryable = true;

            switch (response.status) {
              case 400:
                errorType = ErrorType.VALIDATION;
                retryable = false;
                break;
              case 408:
                errorType = ErrorType.TIMEOUT;
                break;
              case 422:
                errorType = ErrorType.SCRAPING;
                break;
              case 429:
                errorType = ErrorType.RATE_LIMIT;
                break;
              case 503:
                errorType = ErrorType.SERVICE_UNAVAILABLE;
                severity = ErrorSeverity.HIGH;
                break;
              default:
                errorType = ErrorType.NETWORK;
            }

            throw new WebContentAnalyzerError(
              errorType,
              data.error || `HTTP ${response.status}: ${response.statusText}`,
              data.error || 'Failed to analyze website. Please try again.',
              severity,
              retryable
            );
          }

          if (!data.success || !data.data) {
            throw new WebContentAnalyzerError(
              ErrorType.ANALYSIS,
              data.error || 'Analysis failed',
              data.error ||
                'Failed to analyze website content. Please try again.',
              ErrorSeverity.MEDIUM,
              true
            );
          }

          return data;
        });

        dispatch({
          type: 'SET_LOADING_STAGE',
          payload: { stage: 'analyzing' },
        });

        await new Promise((resolve) =>
          setTimeout(resolve, ANALYZE_STAGE_MIN_DELAY_MS)
        );

        if (!result.data) {
          throw new WebContentAnalyzerError(
            ErrorType.ANALYSIS,
            'Missing analysis data in response',
            'Failed to analyze website content. Please try again.',
            ErrorSeverity.MEDIUM,
            true
          );
        }

        dispatch({
          type: 'SET_RESULTS',
          payload: {
            results: result.data.analysis,
            ...(result.data.screenshot
              ? { screenshot: result.data.screenshot }
              : {}),
          },
        });

        setTimeout(() => {
          toast.success('Website analysis completed successfully!', {
            description: `Analyzed ${new URL(url).hostname}`,
          });
        }, 0);
      } catch (error) {
        const analyzedErrorInstance =
          error instanceof WebContentAnalyzerError
            ? error
            : classifyError(error);

        logError(analyzedErrorInstance, {
          url,
          component: 'WebContentAnalyzer',
        });

        const message = getDomainErrorMessage(
          analyzedErrorInstance.code,
          translate,
          analyzedErrorInstance.userMessage
        );

        dispatch({
          type: 'SET_ERROR',
          payload: { error: message },
        });

        setAnalyzedError(analyzedErrorInstance);

        handleAiError(
          {
            ...(analyzedErrorInstance.code
              ? { code: analyzedErrorInstance.code }
              : {}),
            message,
          },
          { source: 'text' }
        );
      }
    },
    [translate, handleAuthError, handleAiError]
  );

  const handleNewAnalysis = useCallback(() => {
    dispatch({ type: 'RESET' });
    setAnalyzedError(null);
  }, []);

  const handleError = useCallback(
    (error: Error) => {
      logAnalyzerComponentError(error);

      dispatch({
        type: 'SET_ERROR',
        payload: {
          error:
            'An unexpected error occurred. Please refresh the page and try again.',
        },
      });

      handleAiError(
        {
          message:
            'An unexpected error occurred. Please refresh the page and try again.',
        },
        { source: 'text' }
      );
    },
    [handleAiError]
  );

  return {
    state,
    modelProvider,
    setModelProvider,
    analyzedError,
    setAnalyzedError,
    handleAnalyzeUrl,
    handleNewAnalysis,
    handleError,
  };
}
