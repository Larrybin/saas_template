import type { Logger } from '@/lib/server/logger';
import { getLogger } from '@/lib/server/logger';

export type LifecycleLogger = Pick<Logger, 'error' | 'info' | 'warn'>;

/**
 * Creates the default lifecycle logger backed by the shared server logger,
 * ensuring consistent formatting and log routing across hooks.
 */
export function createLifecycleLogger(): LifecycleLogger {
  const logger = getLogger({ span: 'user-lifecycle' });
  return {
    error: logger.error.bind(logger),
    info: logger.info.bind(logger),
    warn: logger.warn.bind(logger),
  };
}

export function createLifecycleLoggerFromAppLogger(
  appLogger: Logger
): LifecycleLogger {
  return {
    error: appLogger.error.bind(appLogger),
    info: appLogger.info.bind(appLogger),
    warn: appLogger.warn.bind(appLogger),
  };
}
