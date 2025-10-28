'use client';

import type {
  AnalysisState,
  AnalyzeContentResponse,
  ModelProvider,
  WebContentAnalyzerProps,
} from '@/ai/text/utils/web-content-analyzer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Component, useCallback, useReducer, useState } from 'react';
import { toast } from 'sonner';
import {
  ErrorSeverity,
  ErrorType,
  WebContentAnalyzerError,
  classifyError,
  logError,
  withRetry,
} from '../utils/error-handling';
import { AnalysisResults as AnalysisResultsComponent } from './analysis-results';
import { LoadingStates } from './loading-states';
import { UrlInputForm } from './url-input-form';

// Action types for state reducer
type AnalysisAction =
  | { type: 'START_ANALYSIS'; payload: { url: string } }
  | { type: 'SET_LOADING_STAGE'; payload: { stage: 'scraping' | 'analyzing' } }
  | {
      type: 'SET_RESULTS';
      payload: { results: AnalysisState['results']; screenshot?: string };
    }
  | { type: 'SET_ERROR'; payload: { error: string } }
  | { type: 'RESET' };

// State reducer for better state management and performance
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

// Initial state
const initialState: AnalysisState = {
  url: '',
  isLoading: false,
  loadingStage: null,
  results: null,
  error: null,
  screenshot: undefined,
};

// Error boundary component for handling component errors
class ErrorBoundary extends Component<
  {
    children: React.ReactNode;
    onError: (error: Error) => void;
  },
  { hasError: boolean }
> {
  constructor(props: {
    children: React.ReactNode;
    onError: (error: Error) => void;
  }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      'WebContentAnalyzer Error Boundary caught an error:',
      error,
      errorInfo
    );
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full max-w-2xl mx-auto">
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="rounded-full p-2 bg-red-100 dark:bg-red-900/30">
                  <svg
                    className="size-5 text-red-600 dark:text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
                  Component Error
                </h3>
                <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                  An unexpected error occurred. Please refresh the page and try
                  again.
                </p>
                <div className="mt-4">
                  <Button
                    onClick={() => window.location.reload()}
                    variant="outline"
                    className="text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 border-red-200 dark:border-red-800"
                  >
                    <svg
                      className="size-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Refresh Page
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function WebContentAnalyzer({ className }: WebContentAnalyzerProps) {
  // Use reducer for better state management and performance
  const [state, dispatch] = useReducer(analysisReducer, initialState);

  // Model provider state
  const [modelProvider, setModelProvider] =
    useState<ModelProvider>('openrouter');

  // Enhanced error state
  const [analyzedError, setAnalyzedError] =
    useState<WebContentAnalyzerError | null>(null);

  // Handle analysis submission with enhanced error handling
  const handleAnalyzeUrl = useCallback(
    async (url: string, provider: ModelProvider) => {
      // Reset state and start analysis
      dispatch({ type: 'START_ANALYSIS', payload: { url } });
      setAnalyzedError(null);

      try {
        // Use retry mechanism for the API call
        const result = await withRetry(async () => {
          const response = await fetch('/api/analyze-content', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url, modelProvider: provider }),
          });

          const data: AnalyzeContentResponse = await response.json();

          // Handle HTTP errors
          if (!response.ok) {
            // Create specific error based on status code
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

        // Update state to analyzing stage
        dispatch({
          type: 'SET_LOADING_STAGE',
          payload: { stage: 'analyzing' },
        });

        // Simulate a brief delay for analyzing stage to show progress
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Set results and complete analysis
        dispatch({
          type: 'SET_RESULTS',
          payload: {
            results: result.data!.analysis,
            screenshot: result.data!.screenshot,
          },
        });

        // Show success toast - defer to avoid flushSync during render
        setTimeout(() => {
          toast.success('Website analysis completed successfully!', {
            description: `Analyzed ${new URL(url).hostname}`,
          });
        }, 0);
      } catch (error) {
        // Classify the error
        const analyzedError =
          error instanceof WebContentAnalyzerError
            ? error
            : classifyError(error);

        // Log the error
        logError(analyzedError, { url, component: 'WebContentAnalyzer' });

        // Update state with error
        dispatch({
          type: 'SET_ERROR',
          payload: { error: analyzedError.userMessage },
        });

        // Set the analyzed error for the ErrorDisplay component
        setAnalyzedError(analyzedError);

        // Show error toast with appropriate severity - defer to avoid flushSync during render
        const toastOptions = {
          description: analyzedError.userMessage,
        };

        setTimeout(() => {
          switch (analyzedError.severity) {
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
    []
  );

  // Handle starting a new analysis
  const handleNewAnalysis = useCallback(() => {
    dispatch({ type: 'RESET' });
    setAnalyzedError(null);
  }, []);

  // Handle component errors
  const handleError = useCallback((error: Error) => {
    console.error('WebContentAnalyzer component error:', error);

    dispatch({
      type: 'SET_ERROR',
      payload: {
        error:
          'An unexpected error occurred. Please refresh the page and try again.',
      },
    });

    // Defer toast to avoid flushSync during render
    setTimeout(() => {
      toast.error('Component error', {
        description: 'An unexpected error occurred. Please refresh the page.',
      });
    }, 0);
  }, []);

  return (
    <ErrorBoundary onError={handleError}>
      <div className={cn('w-full space-y-8', className)}>
        {/* Main Content Area */}
        <div className="space-y-8">
          {/* URL Input Form - Always visible */}
          {!state.results && (
            <UrlInputForm
              onSubmit={handleAnalyzeUrl}
              isLoading={state.isLoading}
              disabled={state.isLoading}
              modelProvider={modelProvider}
              setModelProvider={setModelProvider}
            />
          )}

          {/* Loading States */}
          {state.isLoading && state.loadingStage && (
            <LoadingStates stage={state.loadingStage} url={state.url} />
          )}

          {/* Error State */}
          {state.error && !state.isLoading && (
            <div className="w-full max-w-2xl mx-auto">
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="rounded-full p-2 bg-red-100 dark:bg-red-900/30">
                      <svg
                        className="size-5 text-red-600 dark:text-red-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
                      Analysis Failed
                    </h3>
                    <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                      {state.error}
                    </p>
                    <div className="mt-4">
                      <Button
                        onClick={handleNewAnalysis}
                        variant="outline"
                        className="text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 border-red-200 dark:border-red-800"
                      >
                        <svg
                          className="size-4 mr-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        Try Again
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Analysis Results */}
          {state.results && !state.isLoading && (
            <AnalysisResultsComponent
              results={state.results}
              screenshot={state.screenshot}
              onNewAnalysis={handleNewAnalysis}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
