import { describe, expect, it, vi } from 'vitest';
import '../helpers/actions';

import { getLifetimeStatusAction } from '@/actions/get-lifetime-status';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { getAllPricePlans } from '@/lib/price-plan';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/lib/price-plan', () => ({
  getAllPricePlans: vi.fn(),
  findPlanByPriceId: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}));

describe('getLifetimeStatusAction DomainError behavior', () => {
  const user = { id: 'user_1' } as User;

  it('throws DomainError when no lifetime plans are defined', async () => {
    (
      getAllPricePlans as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce([]);

    await expect(
      getLifetimeStatusAction({
        ctx: { user },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.UnexpectedError,
      retryable: false,
    });
  });

  it('rethrows DomainError from getDb', async () => {
    const { getDb } = await import('@/db');

    (
      getAllPricePlans as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce([{ id: 'lifetime', isLifetime: true }]);

    (getDb as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.UnexpectedError,
        message: 'domain failure',
        retryable: true,
      })
    );

    await expect(
      getLifetimeStatusAction({
        ctx: { user },
      } as never)
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('wraps non-DomainError into UnexpectedError DomainError', async () => {
    const { getDb } = await import('@/db');

    (
      getAllPricePlans as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce([{ id: 'lifetime', isLifetime: true }]);

    (getDb as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('db down')
    );

    await expect(
      getLifetimeStatusAction({
        ctx: { user },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    });
  });
});
