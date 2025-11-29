import { describe, expect, it, vi } from 'vitest';

import { createPortalAction } from '@/actions/create-customer-portal-session';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/lib/safe-action', () => ({
  userActionClient: {
    schema: () => ({
      // 在测试中直接暴露内部实现，绕过 safe-action 封装
      action: (impl: unknown) => impl,
    }),
  },
}));

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('en'),
}));

vi.mock('@/payment', () => ({
  createCustomerPortal: vi.fn(),
}));

vi.mock('@/lib/urls/urls', () => ({
  getUrlWithLocale: vi.fn(() => '/settings/billing'),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

describe('createPortalAction DomainError behavior', () => {
  const user = {
    id: 'user_1',
  } as User;

  const baseInput = {
    userId: user.id,
    returnUrl: undefined as string | undefined,
  };

  it('rethrows DomainError from getDb', async () => {
    const { getDb } = await import('@/db');

    (getDb as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.UnexpectedError,
        message: 'domain failure',
        retryable: true,
      })
    );

    await expect(
      createPortalAction({
        parsedInput: baseInput,
        ctx: { user },
      } as never)
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('wraps non-DomainError into UnexpectedError DomainError', async () => {
    const { getDb } = await import('@/db');

    (getDb as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('db down')
    );

    await expect(
      createPortalAction({
        parsedInput: baseInput,
        ctx: { user },
      } as never)
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    });
  });
});
