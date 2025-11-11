import type { Logger } from '@/lib/logger';

export type LifecycleLogger = Pick<Logger, 'error' | 'info' | 'warn'>;

export function createConsoleLifecycleLogger(): LifecycleLogger {
  return {
    error: console.error.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
  };
}

export function createLifecycleLoggerFromAppLogger(appLogger: Logger): LifecycleLogger {
  return {
    error: appLogger.error.bind(appLogger),
    info: appLogger.info.bind(appLogger),
    warn: appLogger.warn.bind(appLogger),
  };
}
