import {
  ErrorSeverity,
  type WebContentAnalyzerError,
} from '@/ai/text/utils/error-handling';
import { getLogger } from '@/lib/server/logger';

/**
 * Server-side logging helper for WebContentAnalyzer errors.
 *
 * This keeps the shared `logError` helper in `error-handling.ts`
 * simple and browser-compatible, while allowing server code to
 * emit structured logs via the central logger.
 */
export function logAnalyzerErrorServer(
  error: WebContentAnalyzerError,
  context?: Record<string, unknown>
) {
  const logger = getLogger({
    span: 'ai.web-content-analyzer',
  });

  const logData = {
    type: error.type,
    severity: error.severity,
    message: error.message,
    userMessage: error.userMessage,
    retryable: error.retryable,
    context,
    stack: error.stack,
    originalError: error.originalError?.message,
  };

  switch (error.severity) {
    case ErrorSeverity.CRITICAL:
    case ErrorSeverity.HIGH:
      logger.error(logData, 'WebContentAnalyzer error');
      break;
    case ErrorSeverity.MEDIUM:
      logger.warn(logData, 'WebContentAnalyzer warning');
      break;
    case ErrorSeverity.LOW:
      logger.info(logData, 'WebContentAnalyzer info');
      break;
  }
}
