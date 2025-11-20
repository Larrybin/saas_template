/**
 * Frontend logging helper for WebContentAnalyzer component errors.
 *
 * 当前实现仅封装 console.error，方便后续接入前端监控/埋点。
 */
export function logAnalyzerComponentError(
  error: Error,
  context?: Record<string, unknown>
) {
  // eslint-disable-next-line no-console
  console.error('WebContentAnalyzer component error:', {
    error,
    context,
  });
}
