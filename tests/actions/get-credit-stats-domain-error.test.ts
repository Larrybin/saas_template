import { describe, expect, it, vi } from 'vitest';
import '../helpers/actions';

import { getCreditStatsAction } from '@/actions/get-credit-stats';
import { getUserExpiringCreditsAmount } from '@/credits/services/credit-stats-service';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/credits/services/credit-stats-service', () => ({
  getUserExpiringCreditsAmount: vi.fn(),
}));

describe('getCreditStatsAction DomainError behavior', () => {
  const user = { id: 'user_1' } as User;

  it('rethrows DomainError from getUserExpiringCreditsAmount', async () => {
    (
      getUserExpiringCreditsAmount as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.UnexpectedError,
        message: 'domain failure',
        retryable: true,
      })
    );

    await expect(
      getCreditStatsAction({
        ctx: { user },
      } as never)
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('wraps non-DomainError into UnexpectedError DomainError', async () => {
    (
      getUserExpiringCreditsAmount as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error('db down'));

    await expect(
      getCreditStatsAction({
        ctx: { user },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    });
  });
});
