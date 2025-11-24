import { clientLogger } from '@/lib/client-logger';

/**
 * Frontend logging helper for WebContentAnalyzer component errors.
 *
 * 通过 clientLogger 统一前端日志出口，后续可无缝接入监控系统。
 */
export function logAnalyzerComponentError(
  error: Error,
  context?: Record<string, unknown>
) {
  clientLogger.error('WebContentAnalyzer component error:', {
    error,
    context,
  });
}
