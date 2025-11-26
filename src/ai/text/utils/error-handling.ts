/**
 * Error handling utilities for web content analyzer
 */

// Import configuration for performance settings
import { webContentAnalyzerConfig } from '@/ai/text/utils/web-content-config.client';
import { clientLogger } from '@/lib/client-logger';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes, type WebContentErrorCode } from '@/lib/server/error-codes';

// Error types for different failure scenarios
export enum ErrorType {
  VALIDATION = 'validation',
  NETWORK = 'network',
  SCRAPING = 'scraping',
  ANALYSIS = 'analysis',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  AUTHENTICATION = 'authentication',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  UNKNOWN = 'unknown',
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Custom error class for web content analyzer
const AI_ERROR_CODE_MAP: Record<ErrorType, WebContentErrorCode> = {
  [ErrorType.VALIDATION]: ErrorCodes.AiContentValidationError,
  [ErrorType.NETWORK]: ErrorCodes.AiContentNetworkError,
  [ErrorType.SCRAPING]: ErrorCodes.AiContentScrapingError,
  [ErrorType.ANALYSIS]: ErrorCodes.AiContentAnalysisError,
  [ErrorType.TIMEOUT]: ErrorCodes.AiContentTimeout,
  [ErrorType.RATE_LIMIT]: ErrorCodes.AiContentRateLimit,
  [ErrorType.AUTHENTICATION]: ErrorCodes.AiContentAuthError,
  [ErrorType.SERVICE_UNAVAILABLE]: ErrorCodes.AiContentServiceUnavailable,
  [ErrorType.UNKNOWN]: ErrorCodes.AiContentUnknownError,
};

export class WebContentAnalyzerError extends DomainError<WebContentErrorCode> {
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly userMessage: string;
  public readonly originalError: Error | undefined;

  constructor(
    type: ErrorType,
    message: string,
    userMessage: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    retryable = false,
    originalError?: Error
  ) {
    super({
      code: AI_ERROR_CODE_MAP[type],
      message,
      retryable,
    });
    this.name = 'WebContentAnalyzerError';
    this.type = type;
    this.severity = severity;
    this.userMessage = userMessage;
    this.originalError = originalError;
  }
}

// Error classification function
export function classifyError(error: unknown): WebContentAnalyzerError {
  if (error instanceof WebContentAnalyzerError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('econnreset') ||
      message.includes('enotfound')
    ) {
      return new WebContentAnalyzerError(
        ErrorType.NETWORK,
        error.message,
        'Network connection failed. Please check your internet connection and try again.',
        ErrorSeverity.MEDIUM,
        true,
        error
      );
    }

    // Timeout errors
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('aborted')
    ) {
      return new WebContentAnalyzerError(
        ErrorType.TIMEOUT,
        error.message,
        'Request timed out. Please try again with a simpler webpage.',
        ErrorSeverity.MEDIUM,
        true,
        error
      );
    }

    // Scraping errors
    if (
      message.includes('scrape') ||
      message.includes('firecrawl') ||
      message.includes('webpage') ||
      message.includes('content not found')
    ) {
      return new WebContentAnalyzerError(
        ErrorType.SCRAPING,
        error.message,
        'Unable to access the webpage. Please check the URL and try again.',
        ErrorSeverity.MEDIUM,
        true,
        error
      );
    }

    // Analysis errors
    if (
      message.includes('analyze') ||
      message.includes('openai') ||
      message.includes('ai') ||
      message.includes('model')
    ) {
      return new WebContentAnalyzerError(
        ErrorType.ANALYSIS,
        error.message,
        'Failed to analyze webpage content. Please try again.',
        ErrorSeverity.MEDIUM,
        true,
        error
      );
    }

    // Rate limit errors
    if (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('quota')
    ) {
      return new WebContentAnalyzerError(
        ErrorType.RATE_LIMIT,
        error.message,
        'Too many requests. Please wait a moment and try again.',
        ErrorSeverity.MEDIUM,
        true,
        error
      );
    }

    // Authentication errors
    if (
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('token')
    ) {
      return new WebContentAnalyzerError(
        ErrorType.AUTHENTICATION,
        error.message,
        'Authentication failed. Please refresh the page and try again.',
        ErrorSeverity.HIGH,
        false,
        error
      );
    }

    // Service unavailable errors
    if (
      message.includes('service unavailable') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('500')
    ) {
      return new WebContentAnalyzerError(
        ErrorType.SERVICE_UNAVAILABLE,
        error.message,
        'Service is temporarily unavailable. Please try again later.',
        ErrorSeverity.HIGH,
        true,
        error
      );
    }
  }

  // Unknown error
  if (error instanceof Error) {
    return new WebContentAnalyzerError(
      ErrorType.UNKNOWN,
      error.message,
      'An unexpected error occurred. Please try again.',
      ErrorSeverity.MEDIUM,
      true,
      error
    );
  }

  return new WebContentAnalyzerError(
    ErrorType.UNKNOWN,
    'Unknown error occurred',
    'An unexpected error occurred. Please try again.',
    ErrorSeverity.MEDIUM,
    true
  );
}

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export const defaultRetryConfig: RetryConfig = {
  maxAttempts: webContentAnalyzerConfig.performance.maxRetryAttempts,
  baseDelay: webContentAnalyzerConfig.performance.retryDelayMs,
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};

// Retry utility with exponential backoff
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = defaultRetryConfig
): Promise<T> {
  let lastError: WebContentAnalyzerError | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = classifyError(error);

      // Don't retry if error is not retryable or this is the last attempt
      if (!lastError.retryable || attempt === config.maxAttempts) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * config.backoffMultiplier ** (attempt - 1),
        config.maxDelay
      );

      clientLogger.warn(
        `Attempt ${attempt} failed, retrying in ${delay}ms:`,
        lastError.message
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (!lastError) {
    throw new WebContentAnalyzerError(
      ErrorType.UNKNOWN,
      'Retry operation failed without an error',
      'An unexpected error occurred. Please try again.',
      ErrorSeverity.MEDIUM,
      true
    );
  }

  throw lastError;
}

// Error logging utility
export function logError(
  error: WebContentAnalyzerError,
  context?: Record<string, unknown>
) {
  const logData = {
    type: error.type,
    severity: error.severity,
    message: error.message,
    userMessage: error.userMessage,
    retryable: error.retryable,
    context,
    stack: error.stack,
    originalError: error.originalError?.message,
    timestamp: new Date().toISOString(),
  };

  // Log based on severity
  switch (error.severity) {
    case ErrorSeverity.CRITICAL:
      clientLogger.error('CRITICAL WebContentAnalyzer Error:', logData);
      break;
    case ErrorSeverity.HIGH:
      clientLogger.error('HIGH WebContentAnalyzer Error:', logData);
      break;
    case ErrorSeverity.MEDIUM:
      clientLogger.warn('MEDIUM WebContentAnalyzer Error:', logData);
      break;
    case ErrorSeverity.LOW:
      clientLogger.info('LOW WebContentAnalyzer Error:', logData);
      break;
  }
}
