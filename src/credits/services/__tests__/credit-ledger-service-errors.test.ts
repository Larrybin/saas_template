import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserCreditsMock, updateUserCreditsMock, errorLogger } = vi.hoisted(
  () => ({
    getUserCreditsMock: vi.fn(),
    updateUserCreditsMock: vi.fn(),
    errorLogger: vi.fn(),
  })
);

vi.mock('../../domain/credit-ledger-domain-service', () => {
  return {
    CreditLedgerDomainService: vi.fn().mockImplementation(() => ({
      getUserCredits: getUserCreditsMock,
      updateUserCredits: updateUserCreditsMock,
      addCredits: vi.fn(),
      hasTransactionOfType: vi.fn(),
      canAddCreditsByType: vi.fn(),
      processExpiredCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      consumeCredits: vi.fn(),
      hasEnoughCredits: vi.fn(),
    })),
  };
});

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    error: errorLogger,
    warn: vi.fn(),
    info: vi.fn(),
    child: () => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    }),
  }),
}));

import { getUserCredits, updateUserCredits } from '../credit-ledger-service';

describe('credit-ledger-service error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs and rethrows when getUserCredits fails', async () => {
    const failure = new Error('balance unreachable');
    getUserCreditsMock.mockRejectedValueOnce(failure);

    await expect(getUserCredits('user-1')).rejects.toThrow(failure);
    expect(errorLogger).toHaveBeenCalledWith(
      { error: failure, userId: 'user-1' },
      'getUserCredits failed to resolve balance'
    );
  });

  it('logs and rethrows when updateUserCredits fails', async () => {
    const failure = new Error('update failed');
    updateUserCreditsMock.mockRejectedValueOnce(failure);

    await expect(updateUserCredits('user-2', 10)).rejects.toThrow(failure);
    expect(errorLogger).toHaveBeenCalledWith(
      { error: failure, userId: 'user-2' },
      'updateUserCredits failed'
    );
  });
});
