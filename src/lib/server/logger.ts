import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "crypto";
import pino from "pino";

export type LogContext = {
	requestId?: string;
	userId?: string;
	span?: string;
	route?: string;
	provider?: string;
};

const level =
	process.env.LOG_LEVEL ??
	(process.env.NODE_ENV === "development" ? "debug" : "info");

type AppLogFn = {
	(msg: string, ...args: unknown[]): void;
	(obj: unknown, msg?: unknown, ...args: unknown[]): void;
};

type AppLogger = Omit<pino.Logger, "info" | "warn" | "error"> & {
	info: AppLogFn;
	warn: AppLogFn;
	error: AppLogFn;
};

const baseLogger = castLogger(
	pino({
		level,
		timestamp: pino.stdTimeFunctions.isoTime,
		redact: {
			paths: [
				"password",
				"*.password",
				"*.secret",
				"*.token",
				"*.apiKey",
				"*.accessToken",
			],
			censor: "[REDACTED]",
		},
	}),
);

const context = new AsyncLocalStorage<LogContext>();

export function getLogger(bindings: LogContext = {}) {
	const current = context.getStore() ?? {};
	return castLogger(baseLogger.child({ ...current, ...bindings }));
}

export async function withLogContext<T>(
	bindings: LogContext,
	fn: () => Promise<T> | T,
): Promise<T> {
	const parent = context.getStore() ?? {};
	return await context.run({ ...parent, ...bindings }, async () => await fn());
}

export function createRequestLogger(
	metadata: LogContext & { requestId?: string } = {},
) {
	const requestId = metadata.requestId ?? randomUUID();
	return getLogger({ ...metadata, requestId });
}

function castLogger(logger: pino.Logger): AppLogger {
	return logger as unknown as AppLogger;
}

export type Logger = AppLogger;

export type HeaderGetter = {
	get(name: string): string | null | undefined;
};

export function resolveRequestId(headers?: HeaderGetter | null): string {
	if (!headers) {
		return randomUUID();
	}

	const requestId = headers.get("x-request-id") ?? headers.get("x-requestid");
	return requestId ?? randomUUID();
}

export function createLoggerFromHeaders(
	headers: HeaderGetter,
	metadata: LogContext = {},
) {
	const requestId = resolveRequestId(headers);
	return createRequestLogger({ ...metadata, requestId });
}
