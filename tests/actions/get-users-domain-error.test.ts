import { describe, expect, it, vi } from 'vitest';

import { getUsersAction } from '@/actions/get-users';
import { DomainError } from '@/lib/domain-errors';

vi.mock('@/lib/safe-action', () => ({
  adminActionClient: {
    schema: () => ({
      // 在测试中直接暴露内部实现，绕过 safe-action 封装
      action: (impl: unknown) => impl,
    }),
  },
}));

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/lib/demo', () => ({
  isDemoWebsite: () => false,
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
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
