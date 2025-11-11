import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/db';
import {
  addCredits,
  creditLedgerRepository,
  consumeCredits,
} from '../credit-ledger-service';

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}));

describe('CreditLedgerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getDb as unknown as vi.Mock).mockResolvedValue({
      transaction: async (cb: (tx: undefined) => Promise<void>) => {
        await cb(undefined);
      },
    });
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

    expect(updateRemainingSpy).toHaveBeenNthCalledWith(1, 'txn-1', 0, undefined);
    expect(updateRemainingSpy).toHaveBeenNthCalledWith(2, 'txn-2', 40, undefined);
    expect(updateCreditsSpy).toHaveBeenCalledWith('user-1', 70, undefined);
    expect(usageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amount: -30 }),
      undefined
    );
  });

  it('adds credits and writes transaction record', async () => {
    vi.spyOn(creditLedgerRepository, 'findUserCredit').mockResolvedValue({
      id: 'ledger-1',
      userId: 'user-1',
      currentCredits: 10,
    } as any);
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

    expect(upsertSpy).toHaveBeenCalledWith('user-1', 30);
    expect(transactionSpy).toHaveBeenCalled();
  });
});
