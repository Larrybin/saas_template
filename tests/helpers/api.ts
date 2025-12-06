import { vi } from 'vitest';

// Shared mocks for API route tests (auth + rate limit)

export const ensureApiUserMock = vi.fn();
export const enforceRateLimitMock = vi.fn();

/**
 * Initialize common auth + rate-limit happy-path behavior.
 *
 * - Auth: ok + user with given id (default: 'user_1')
 * - Rate limit: ok
 */
export function setupApiAuthAndRateLimit(userId = 'user_1') {
  ensureApiUserMock.mockResolvedValue({
    ok: true,
    user: { id: userId },
    response: null,
  });

  enforceRateLimitMock.mockResolvedValue({ ok: true });
}
