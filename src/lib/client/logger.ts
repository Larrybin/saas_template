const error = () => {
	throw new Error("Logger is only available on the server runtime.");
};

export const getLogger = () => ({
	info: error,
	warn: error,
	error,
});

export const withLogContext = async <T>(
	_bindings: unknown,
	fn: () => Promise<T> | T,
) => await fn();

export const createRequestLogger = getLogger;

export const resolveRequestId = () => {
	error();
};

export const createLoggerFromHeaders = () => getLogger();

export type Logger = ReturnType<typeof getLogger>;
export type LogContext = Record<string, never>;
