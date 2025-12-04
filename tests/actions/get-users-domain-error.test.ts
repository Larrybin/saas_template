import { describe, expect, it, vi } from 'vitest';
import '../helpers/actions';

import { getUsersAction } from '@/actions/get-users';
import { DomainError } from '@/lib/domain-errors';

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/lib/demo', () => ({
  isDemoWebsite: () => false,
}));

describe('getUsersAction DomainError behavior', () => {
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
        code: 'TEST_DOMAIN_ERROR' as never,
        message: 'domain failure',
        retryable: true,
      })
    );

    await expect(
      getUsersAction({
        parsedInput: baseInput,
      } as never)
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('wraps non-DomainError into UnexpectedError DomainError', async () => {
    const { getDb } = await import('@/db');

    (getDb as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('db down')
    );

    await expect(
      getUsersAction({
        parsedInput: baseInput,
      } as never)
    ).rejects.toMatchObject({
      code: 'UNEXPECTED_ERROR',
      retryable: true,
    });
  });
});
