type LogMethod = (...args: unknown[]) => void;

const noop: LogMethod = () => {};

const shouldLog =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_ENABLE_CLIENT_LOGGER === 'true' ||
      process.env.NODE_ENV !== 'production')) ||
  false;

const createLoggerMethod = (
  method: 'debug' | 'info' | 'warn' | 'error'
): LogMethod => {
  if (!shouldLog) {
    return noop;
  }

  return (...args: unknown[]) => {
    if (typeof console === 'undefined') {
      return;
    }

    const fn = console[method] ?? console.log;
    fn.call(console, ...args);
  };
};

export const clientLogger = {
  debug: createLoggerMethod('debug'),
  info: createLoggerMethod('info'),
  warn: createLoggerMethod('warn'),
  error: createLoggerMethod('error'),
};
