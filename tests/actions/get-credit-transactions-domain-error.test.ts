import { describe, expect, it, vi } from 'vitest';
import '../helpers/actions';

import { getCreditTransactionsAction } from '@/actions/get-credit-transactions';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}));

describe('getCreditTransactionsAction DomainError behavior', () => {
  const user = { id: 'user_1' } as User;
  const baseInput = {
    pageIndex: 0,
    pageSize: 10,
    search: '',
    sorting: [],
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
      getCreditTransactionsAction({
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
      getCreditTransactionsAction({
        parsedInput: baseInput,
        ctx: { user },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    });
  });
});
