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
import type {
  AnalysisState,
  AnalyzeContentResponse,
  ModelProvider,
} from '@/ai/text/utils/web-content-analyzer';

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

        dispatch({
          type: 'SET_RESULTS',
          payload: {
            results: result.data!.analysis,
            screenshot: result.data!.screenshot,
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

        dispatch({
          type: 'SET_ERROR',
          payload: { error: analyzedErrorInstance.userMessage },
        });

        setAnalyzedError(analyzedErrorInstance);

        const toastOptions = {
          description: analyzedErrorInstance.userMessage,
        };

        setTimeout(() => {
          switch (analyzedErrorInstance.severity) {
            case ErrorSeverity.CRITICAL:
            case ErrorSeverity.HIGH:
              toast.error('Analysis Failed', toastOptions);
              break;
            case ErrorSeverity.MEDIUM:
              toast.warning('Analysis Failed', toastOptions);
              break;
            case ErrorSeverity.LOW:
              toast.info('Analysis Issue', toastOptions);
              break;
          }
        }, 0);
      }
    },
    [dispatch, setAnalyzedError]
  );

  const handleNewAnalysis = useCallback(() => {
    dispatch({ type: 'RESET' });
    setAnalyzedError(null);
  }, [dispatch, setAnalyzedError]);

  const handleError = useCallback(
    (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('WebContentAnalyzer component error:', error);

      dispatch({
        type: 'SET_ERROR',
        payload: {
          error:
            'An unexpected error occurred. Please refresh the page and try again.',
        },
      });

      setTimeout(() => {
        toast.error('Component error', {
          description: 'An unexpected error occurred. Please refresh the page.',
        });
      }, 0);
    },
    [dispatch]
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
