import { getLogger } from './logger';

type RetryLogger = ReturnType<typeof getLogger>;

export type RetryOptions = {
  /**
   * Maximum number of attempts, including the initial one.
   * Defaults to 3.
   */
  maxAttempts?: number;
  /**
   * Base delay (in milliseconds) for exponential backoff.
   * Defaults to 100.
   */
  baseDelayMs?: number;
  /**
   * Optional logger; falls back to a shared infra logger.
   */
  logger?: Pick<RetryLogger, 'error'>;
  /**
   * Additional context fields to include in retry logs.
   */
  logContext?: Record<string, unknown>;
};

const retryLogger = getLogger({ span: 'infra.retry' });

/**
 * Execute an async operation with simple exponential backoff retry.
 *
 * - Designed for operational errors（网络/下游服务）；
 * - 不做异常类型判断，由调用方决定抛出哪些错误以触发重试；
 * - 记录结构化日志，包含 operation/attempt/maxAttempts 等字段。
 */
export async function withRetry<T>(
  operation: string,
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 100, logger = retryLogger, logContext } =
    options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      logger.error(
        {
          error,
          operation,
          attempt,
          maxAttempts,
          ...(logContext ?? {}),
        },
        'operation failed, will retry'
      );

      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  throw (lastError ??
    new Error(
      `Operation "${operation}" failed after ${options.maxAttempts ?? 3} attempts`
    )) as Error;
}

