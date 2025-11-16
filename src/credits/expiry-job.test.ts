import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

const { processExpiredCreditsForUsersMock } = vi.hoisted(() => ({
  processExpiredCreditsForUsersMock: vi.fn(),
}));

vi.mock('./domain/credit-ledger-domain-service', () => ({
  CreditLedgerDomainService: vi.fn().mockImplementation(() => ({
    processExpiredCreditsForUsers: processExpiredCreditsForUsersMock,
  })),
}));

import { getDb } from '@/db';
import { runExpirationJob } from './expiry-job';

const mockedGetDb = getDb as unknown as ReturnType<typeof vi.fn>;

describe('runExpirationJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processExpiredCreditsForUsersMock.mockReset();
  });

  it('processes expirable users in batches via domain service', async () => {
    const tx = {};

    mockedGetDb.mockResolvedValue({
      selectDistinct: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([{ userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-3' }]),
        }),
      }),
      transaction: async (fn: (executor: unknown) => Promise<void>) => {
        await fn(tx);
      },
    } as never);

    processExpiredCreditsForUsersMock
      .mockResolvedValueOnce({
        processedCount: 2,
        errorCount: 0,
        totalExpiredCredits: 10,
      })
      .mockResolvedValueOnce({
        processedCount: 1,
        errorCount: 0,
        totalExpiredCredits: 5,
      });

    const result = await runExpirationJob({ batchSize: 2 });

    expect(processExpiredCreditsForUsersMock).toHaveBeenCalledTimes(2);
    expect(processExpiredCreditsForUsersMock).toHaveBeenNthCalledWith(
      1,
      ['user-1', 'user-2'],
      tx
    );
    expect(processExpiredCreditsForUsersMock).toHaveBeenNthCalledWith(
      2,
      ['user-3'],
      tx
    );

    expect(result).toEqual({
      usersCount: 3,
      processedCount: 3,
      errorCount: 0,
      totalExpiredCredits: 15,
    });
  });
});
