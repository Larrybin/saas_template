import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '@/lib/server/logger';
import { CreditLedgerService } from '../credit-ledger-service';

const { getUserCreditsMock, updateUserCreditsMock, errorLogger } = vi.hoisted(
  () => ({
    getUserCreditsMock: vi.fn(),
    updateUserCreditsMock: vi.fn(),
    errorLogger: vi.fn(),
  })
);

function createService() {
  const logger: Pick<Logger, 'info' | 'warn' | 'error'> = {
    error: errorLogger as Logger['error'],
    warn: vi.fn() as Logger['warn'],
    info: vi.fn() as Logger['info'],
  };

  const policy = {
    getRegisterGiftRule: vi.fn(),
    getMonthlyFreeRule: vi.fn(),
    getSubscriptionRenewalRule: vi.fn(),
    getLifetimeMonthlyRule: vi.fn(),
    resolveCurrentPlan: vi.fn() as any,
  };

  const domainService = {
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
  } as any;

  return new CreditLedgerService(policy, domainService, logger);
}

describe('credit-ledger-service error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs and rethrows when getUserCredits fails', async () => {
    const failure = new Error('balance unreachable');
    getUserCreditsMock.mockRejectedValueOnce(failure);

    const service = createService();

    await expect(service.getUserCredits('user-1')).rejects.toThrow(failure);
    expect(errorLogger).toHaveBeenCalledWith(
      { error: failure, userId: 'user-1' },
      'getUserCredits failed to resolve balance'
    );
  });

  it('logs and rethrows when updateUserCredits fails', async () => {
    const failure = new Error('update failed');
    updateUserCreditsMock.mockRejectedValueOnce(failure);

    const service = createService();

    await expect(service.updateUserCredits('user-2', 10)).rejects.toThrow(
      failure
    );
    expect(errorLogger).toHaveBeenCalledWith(
      { error: failure, userId: 'user-2' },
      'updateUserCredits failed'
    );
  });
});
