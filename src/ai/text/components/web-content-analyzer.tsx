'use client';

import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

import type { WebContentAnalyzerProps } from '@/ai/text/utils/web-content-analyzer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useWebContentAnalyzer } from './use-web-content-analyzer';
import { AnalysisResults as AnalysisResultsComponent } from './analysis-results';
import { LoadingStates } from './loading-states';
import { UrlInputForm } from './url-input-form';

class ErrorBoundary extends Component<
  {
    children: ReactNode;
    onError: (error: Error) => void;
  },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
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
  const {
    state,
    modelProvider,
    setModelProvider,
    handleAnalyzeUrl,
    handleNewAnalysis,
    handleError,
  } = useWebContentAnalyzer();

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
