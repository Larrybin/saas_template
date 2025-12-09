import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { InsufficientCreditsError } from '@/credits/domain/errors';
import { getDb } from '@/db';
import type { DbExecutor } from '../../data-access/types';
import { CREDIT_TRANSACTION_TYPE } from '../../types';
import {
  addCredits,
  consumeCredits,
  creditLedgerRepository,
  hasEnoughCredits,
} from '../credit-ledger-service';

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

type GetDbMock = Mock<
  () => Promise<{
    transaction: (cb: (tx: DbExecutor) => Promise<void>) => Promise<void>;
  }>
>;

describe('CreditLedgerService', () => {
  const mockedGetDb = getDb as unknown as GetDbMock;
  let fakeDb: Awaited<ReturnType<GetDbMock>>;
  let fakeExecutor: DbExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeExecutor = {} as DbExecutor;
    fakeDb = {
      transaction: async (cb: (tx: DbExecutor) => Promise<void>) => {
        await cb(fakeExecutor);
      },
    } as Awaited<ReturnType<GetDbMock>>;
    mockedGetDb.mockResolvedValue(fakeDb);
  });

  it('consumes credits FIFO and records usage', async () => {
    vi.spyOn(creditLedgerRepository, 'findUserCredit').mockResolvedValue({
      id: 'ledger-1',
      userId: 'user-1',
      currentCredits: 100,
    } as any);
    vi.spyOn(
      creditLedgerRepository,
      'findFifoEligibleTransactions'
    ).mockResolvedValue([
      { id: 'txn-1', remainingAmount: 20 },
      { id: 'txn-2', remainingAmount: 50 },
    ] as any);
    const updateRemainingSpy = vi
      .spyOn(creditLedgerRepository, 'updateTransactionRemainingAmount')
      .mockResolvedValue();
    const updateCreditsSpy = vi
      .spyOn(creditLedgerRepository, 'updateUserCredits')
      .mockResolvedValue();
    const usageSpy = vi
      .spyOn(creditLedgerRepository, 'insertUsageRecord')
      .mockResolvedValue();

    await consumeCredits({
      userId: 'user-1',
      amount: 30,
      description: 'Test',
    });

    expect(updateRemainingSpy).toHaveBeenNthCalledWith(
      1,
      'txn-1',
      0,
      fakeExecutor
    );
    expect(updateRemainingSpy).toHaveBeenNthCalledWith(
      2,
      'txn-2',
      40,
      fakeExecutor
    );
    expect(updateCreditsSpy).toHaveBeenCalledWith('user-1', 70, fakeExecutor);
    expect(usageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amount: -30 }),
      fakeExecutor
    );
  });

  it('adds credits and writes transaction record', async () => {
    const upsertSpy = vi
      .spyOn(creditLedgerRepository, 'upsertUserCredit')
      .mockResolvedValue();
    const transactionSpy = vi
      .spyOn(creditLedgerRepository, 'insertTransaction')
      .mockResolvedValue();

    await addCredits({
      userId: 'user-1',
      amount: 20,
      type: 'TEST',
      description: 'bonus',
    });

    expect(upsertSpy).toHaveBeenCalledWith('user-1', 20, fakeExecutor);
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Object),
      fakeExecutor
    );
  });

  it('prioritizes expiring transactions before non-expiring ones', async () => {
    vi.spyOn(creditLedgerRepository, 'findUserCredit').mockResolvedValue({
      currentCredits: 100,
    } as any);
    const findTransactions = vi
      .spyOn(creditLedgerRepository, 'findFifoEligibleTransactions')
      .mockResolvedValue([
        {
          id: 'txn-exp',
          remainingAmount: 20,
          expirationDate: new Date('2024-01-05'),
          createdAt: new Date('2024-01-02'),
        },
        {
          id: 'txn-non-exp',
          remainingAmount: 40,
          expirationDate: null,
          createdAt: new Date('2024-01-01'),
        },
      ] as any);
    const updateRemainingSpy = vi
      .spyOn(creditLedgerRepository, 'updateTransactionRemainingAmount')
      .mockResolvedValue();
    vi.spyOn(creditLedgerRepository, 'updateUserCredits').mockResolvedValue();
    vi.spyOn(creditLedgerRepository, 'insertUsageRecord').mockResolvedValue();

    await consumeCredits({
      userId: 'user-1',
      amount: 50,
      description: 'Test FIFO ordering',
    });

    expect(findTransactions).toHaveBeenCalled();
    expect(updateRemainingSpy).toHaveBeenNthCalledWith(
      1,
      'txn-exp',
      0,
      fakeExecutor
    );
    expect(updateRemainingSpy).toHaveBeenNthCalledWith(
      2,
      'txn-non-exp',
      10,
      fakeExecutor
    );
  });

  it('treats zero expireDays as non-expiring credits', async () => {
    vi.spyOn(creditLedgerRepository, 'findUserCredit').mockResolvedValue({
      id: 'ledger-1',
      userId: 'user-1',
      currentCredits: 0,
    } as any);
    vi.spyOn(creditLedgerRepository, 'upsertUserCredit').mockResolvedValue();
    const transactionSpy = vi
      .spyOn(creditLedgerRepository, 'insertTransaction')
      .mockResolvedValue();

    await addCredits({
      userId: 'user-1',
      amount: 10,
      type: 'TEST',
      description: 'gift',
      expireDays: 0,
    });

    expect(transactionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ expirationDate: undefined }),
      fakeExecutor
    );
  });

  it('throws when periodic credits are missing periodKey', async () => {
    await expect(
      addCredits({
        userId: 'user-1',
        amount: 10,
        type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
        description: 'missing periodKey',
      })
    ).rejects.toThrow('periodKey is required for periodic credit transactions');
  });

  it('throws when non-periodic credits set periodKey', async () => {
    await expect(
      addCredits({
        userId: 'user-1',
        amount: 10,
        type: CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE,
        description: 'wrong periodKey',
        periodKey: 202501,
      } as any)
    ).rejects.toThrow(
      'periodKey should not be set for non-periodic credit transactions'
    );
  });

  it('indicates whether user has enough credits based on current balance', async () => {
    const findUserCreditSpy = vi
      .spyOn(creditLedgerRepository, 'findUserCredit')
      .mockResolvedValueOnce({
        currentCredits: 30,
      } as any)
      .mockResolvedValueOnce({
        currentCredits: 10,
      } as any);

    const enough = await hasEnoughCredits({
      userId: 'user-1',
      requiredCredits: 20,
    });
    const notEnough = await hasEnoughCredits({
      userId: 'user-1',
      requiredCredits: 20,
    });

    expect(findUserCreditSpy).toHaveBeenCalledTimes(2);
    expect(enough).toBe(true);
    expect(notEnough).toBe(false);
  });

  it('throws InsufficientCreditsError when consuming more credits than available', async () => {
    vi.spyOn(creditLedgerRepository, 'findUserCredit').mockResolvedValue({
      id: 'ledger-1',
      userId: 'user-1',
      currentCredits: 10,
    } as any);
    vi.spyOn(
      creditLedgerRepository,
      'findFifoEligibleTransactions'
    ).mockResolvedValue([{ id: 'txn-1', remainingAmount: 5 }] as any);
    const updateRemainingSpy = vi
      .spyOn(creditLedgerRepository, 'updateTransactionRemainingAmount')
      .mockResolvedValue();
    const updateCreditsSpy = vi
      .spyOn(creditLedgerRepository, 'updateUserCredits')
      .mockResolvedValue();
    const usageSpy = vi
      .spyOn(creditLedgerRepository, 'insertUsageRecord')
      .mockResolvedValue();

    await expect(
      consumeCredits({
        userId: 'user-1',
        amount: 20,
        description: 'Insufficient balance test',
      })
    ).rejects.toBeInstanceOf(InsufficientCreditsError);

    expect(updateRemainingSpy).not.toHaveBeenCalled();
    expect(updateCreditsSpy).not.toHaveBeenCalled();
    expect(usageSpy).not.toHaveBeenCalled();
  });
});
