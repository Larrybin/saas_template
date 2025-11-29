import { describe, expect, it, vi } from 'vitest';

import { getCreditBalanceAction } from '@/actions/get-credit-balance';
import { getUserCredits } from '@/credits/credits';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/lib/safe-action', () => ({
  userActionClient: {
    action: (impl: unknown) => impl,
  },
}));

vi.mock('@/credits/credits', () => ({
  getUserCredits: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

describe('getCreditBalanceAction DomainError behavior', () => {
  const user = { id: 'user_1' } as User;

  it('returns success with credits when provider succeeds', async () => {
    (
      getUserCredits as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(42);

    const result = await getCreditBalanceAction({
      ctx: { user },
    } as never);

    expect(result).toEqual({ success: true, credits: 42 });
  });

  it('rethrows DomainError from getUserCredits', async () => {
    (
      getUserCredits as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.UnexpectedError,
        message: 'domain failure',
        retryable: false,
      })
    );

    await expect(
      getCreditBalanceAction({
        ctx: { user },
      } as never)
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('wraps non-DomainError into UnexpectedError DomainError', async () => {
    (
      getUserCredits as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error('unexpected'));

    await expect(
      getCreditBalanceAction({
        ctx: { user },
      } as never)
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    });
  });
});
