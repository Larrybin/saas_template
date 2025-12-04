import { describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();

vi.mock('server-only', () => ({}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
  },
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ensureApiUser } from '../api-auth';

describe('ensureApiUser', () => {
  it('returns ok:true with normalized user for valid session', async () => {
    getSessionMock.mockResolvedValueOnce({
      user: {
        id: 'user_1',
        email: 'user@example.com',
        role: null,
        banned: null,
      },
    });

    const req = new Request('http://localhost/api/test');

    const result = await ensureApiUser(req);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe('user_1');
      // role / banned should be normalized
      expect(result.user.role).toBe('user');
      expect(result.user.banned).toBe(false);
    }
  });

  it('returns AUTH_BANNED response when user is banned', async () => {
    getSessionMock.mockResolvedValueOnce({
      user: {
        id: 'user_1',
        email: 'user@example.com',
        role: 'user',
        banned: true,
      },
    });

    const req = new Request('http://localhost/api/test');

    const result = await ensureApiUser(req);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const res = result.response;

      expect(res.status).toBe(403);

      const json = (await res.json()) as {
        success: boolean;
        code?: string;
        retryable?: boolean;
      };

      expect(json.success).toBe(false);
      expect(json.code).toBe('AUTH_BANNED');
      expect(json.retryable).toBe(false);
    } else {
      throw new Error('expected ensureApiUser to return banned response');
    }
  });

  it('returns AUTH_UNAUTHORIZED response when session is missing', async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/test');

    const result = await ensureApiUser(req);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      const res = result.response;

      expect(res.status).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');

      const json = (await res.json()) as {
        success: boolean;
        code?: string;
        retryable?: boolean;
      };

      expect(json.success).toBe(false);
      expect(json.code).toBe('AUTH_UNAUTHORIZED');
      expect(json.retryable).toBe(false);
    } else {
      throw new Error('expected ensureApiUser to return unauthorized response');
    }
  });

  it('returns AUTH_UNAUTHORIZED response when auth throws error', async () => {
    getSessionMock.mockRejectedValueOnce(new Error('auth failure'));

    const req = new Request('http://localhost/api/test');

    const result = await ensureApiUser(req);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      const res = result.response;

      expect(res.status).toBe(401);
    } else {
      throw new Error(
        'expected ensureApiUser to return unauthorized response on error'
      );
    }
  });
});
