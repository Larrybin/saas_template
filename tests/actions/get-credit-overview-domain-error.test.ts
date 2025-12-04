import { describe, expect, it, vi } from 'vitest';
import '../helpers/actions';

import { getCreditOverviewAction } from '@/actions/get-credit-overview';
import { getUserCredits } from '@/credits/credits';
import { getUserExpiringCreditsAmount } from '@/credits/services/credit-stats-service';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/credits/credits', () => ({
  getUserCredits: vi.fn(),
}));

vi.mock('@/credits/services/credit-stats-service', () => ({
  getUserExpiringCreditsAmount: vi.fn(),
}));

describe('getCreditOverviewAction', () => {
  const user = { id: 'user_1' } as User;

  it('returns credit overview on success', async () => {
    (getUserCredits as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      100
    );
    (
      getUserExpiringCreditsAmount as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(30);

    const result = await getCreditOverviewAction({
      ctx: { user },
    } as never);

    expect(result).toEqual({
      success: true,
      data: {
        balance: 100,
        expiringCredits: {
          amount: 30,
        },
      },
    });
    expect(getUserCredits).toHaveBeenCalledWith(user.id);
    expect(getUserExpiringCreditsAmount).toHaveBeenCalledWith(user.id);
  });

  it('rethrows DomainError from underlying services', async () => {
    const domainError = new DomainError({
      code: ErrorCodes.UnexpectedError,
      message: 'domain failure',
      retryable: true,
    });

    (getUserCredits as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      domainError
    );
    (
      getUserExpiringCreditsAmount as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(0);

    await expect(
      getCreditOverviewAction({
        ctx: { user },
      } as never)
    ).rejects.toBe(domainError);
  });

  it('wraps non-DomainError into UnexpectedError DomainError', async () => {
    (getUserCredits as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down')
    );
    (
      getUserExpiringCreditsAmount as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(0);

    await expect(
      getCreditOverviewAction({
        ctx: { user },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    });
  });
});
