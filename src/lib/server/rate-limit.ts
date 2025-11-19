import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { serverEnv } from "@/env/server";

type WindowUnit = "s" | "m" | "h" | "d";
type RateLimitWindow = `${number} ${WindowUnit}`;

type RateLimitOptions = {
	request: Request;
	scope: string;
	limit: number;
	window?: RateLimitWindow;
	userId?: string;
};

type RateLimitResult =
	| { ok: true }
	| {
			ok: false;
			response: NextResponse;
	  };

const redisConfig = serverEnv.rateLimit;
const redisClient =
	redisConfig?.redisRestUrl && redisConfig.redisRestToken
		? new Redis({
				url: redisConfig.redisRestUrl,
				token: redisConfig.redisRestToken,
			})
		: null;

const limiterCache = new Map<string, Ratelimit>();
const memoryStore = new Map<string, { count: number; expiresAt: number }>();

const DEFAULT_WINDOW: RateLimitWindow = "1 m";

/**
 * Applies a sliding-window rate limit using Upstash if available, otherwise falls back
 * to an in-memory token bucket (best-effort for local development).
 */
export async function enforceRateLimit(
	options: RateLimitOptions,
): Promise<RateLimitResult> {
	const window = options.window ?? DEFAULT_WINDOW;
	const windowMs = windowToMs(window);
	const identifier = buildIdentifier(options);

	if (!identifier) {
		return { ok: true };
	}

	if (redisClient) {
		const limiter = getOrCreateLimiter(options.limit, window);
		const result = await limiter.limit(identifier);

		if (!result.success) {
			return {
				ok: false,
				response: buildRateLimitResponse({
					limit: options.limit,
					remaining: result.remaining,
					reset: result.reset,
				}),
			};
		}

		return { ok: true };
	}

	// Fallback for local dev without Upstash configured.
	const now = Date.now();
	const entry = memoryStore.get(identifier);

	if (!entry || entry.expiresAt <= now) {
		memoryStore.set(identifier, {
			count: 1,
			expiresAt: now + windowMs,
		});
		return { ok: true };
	}

	if (entry.count >= options.limit) {
		return {
			ok: false,
			response: buildRateLimitResponse({
				limit: options.limit,
				remaining: 0,
				reset: entry.expiresAt,
			}),
		};
	}

	entry.count += 1;
	memoryStore.set(identifier, entry);
	return { ok: true };
}

function buildIdentifier(options: RateLimitOptions): string | null {
	const parts: string[] = [];

	if (options.scope) {
		parts.push(options.scope);
	}

	const userOrIp =
		options.userId ?? getForwardedIp(options.request) ?? "anonymous";
	parts.push(userOrIp);

	return parts.length > 0 ? parts.join(":") : null;
}

function getForwardedIp(request: Request): string | undefined {
	const forwardedFor = request.headers.get("x-forwarded-for");
	if (forwardedFor) {
		const [first] = forwardedFor.split(",");
		if (first) {
			return first.trim();
		}
	}

	const realIp = request.headers.get("x-real-ip");
	if (realIp) {
		return realIp;
	}

	return undefined;
}

function windowToMs(window: RateLimitWindow): number {
	const [amountStr, unit] = window.trim().split(/\s+/);
	const amount = Number.parseInt(amountStr, 10);

	if (Number.isNaN(amount) || amount <= 0) {
		throw new Error(`Invalid rate limit window: ${window}`);
	}

	switch (unit as WindowUnit) {
		case "s":
			return amount * 1000;
		case "m":
			return amount * 60 * 1000;
		case "h":
			return amount * 60 * 60 * 1000;
		case "d":
			return amount * 24 * 60 * 60 * 1000;
		default:
			throw new Error(`Unsupported window unit: ${unit}`);
	}
}

function getOrCreateLimiter(limit: number, window: RateLimitWindow): Ratelimit {
	const cacheKey = `${limit}:${window}`;
	const existingLimiter = limiterCache.get(cacheKey);

	if (existingLimiter) {
		return existingLimiter;
	}

	if (!redisClient) {
		throw new Error("Redis client not configured");
	}

	const limiter = new Ratelimit({
		redis: redisClient,
		limiter: Ratelimit.slidingWindow(limit, window),
		prefix: "mksaas",
	});

	limiterCache.set(cacheKey, limiter);

	return limiter;
}

function buildRateLimitResponse({
	limit,
	remaining,
	reset,
}: {
	limit: number;
	remaining: number;
	reset: number;
}): NextResponse {
	const resetMs = typeof reset === "number" ? reset : Date.now();
	const retryAfterSeconds = Math.max(
		1,
		Math.ceil((resetMs - Date.now()) / 1000),
	);

	return NextResponse.json(
		{
			error: "Rate limit exceeded. Please try again later.",
		},
		{
			status: 429,
			headers: {
				"Retry-After": retryAfterSeconds.toString(),
				"X-RateLimit-Limit": limit.toString(),
				"X-RateLimit-Remaining": Math.max(0, remaining).toString(),
				"X-RateLimit-Reset": resetMs.toString(),
			},
		},
	);
}
