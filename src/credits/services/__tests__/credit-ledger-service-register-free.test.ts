import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PlanCreditsPolicy,
  PlanCreditsRule,
} from '@/credits/domain/plan-credits-policy';
import { CreditLedgerService } from '@/credits/services/credit-ledger-service';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';

const { hasTransactionOfTypeMock, addCreditsMock, canAddCreditsByTypeMock } =
  vi.hoisted(() => ({
    hasTransactionOfTypeMock: vi.fn(),
    addCreditsMock: vi.fn(),
    canAddCreditsByTypeMock: vi.fn(),
  }));

vi.mock('@/credits/domain/credit-ledger-domain-service', () => {
  return {
    CreditLedgerDomainService: vi.fn().mockImplementation(() => ({
      getUserCredits: vi.fn(),
      updateUserCredits: vi.fn(),
      addCredits: addCreditsMock,
      hasTransactionOfType: hasTransactionOfTypeMock,
      processExpiredCredits: vi.fn(),
      processExpiredCreditsForUsers: vi.fn(),
      canAddCreditsByType: canAddCreditsByTypeMock,
      consumeCredits: vi.fn(),
      hasEnoughCredits: vi.fn(),
    })),
  };
});

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

describe('CreditLedgerService register gift and free monthly credits', () => {
  const createPolicy = (): PlanCreditsPolicy => ({
    getRegisterGiftRule: vi.fn(),
    getMonthlyFreeRule: vi.fn(),
    getSubscriptionRenewalRule: vi.fn(),
    getLifetimeMonthlyRule: vi.fn(),
    resolveCurrentPlan: vi.fn() as any,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants register gift credits only once when rule exists', async () => {
    const rule: PlanCreditsRule = {
      enabled: true,
      amount: 50,
      expireDays: 30,
      isFree: false,
      isLifetime: false,
      disabled: false,
    };
    const policy = createPolicy();
    policy.getRegisterGiftRule = vi.fn().mockReturnValue(rule);

    hasTransactionOfTypeMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const service = new CreditLedgerService(policy);

    await service.addRegisterGiftCredits('user-1');
    await service.addRegisterGiftCredits('user-1');

    expect(hasTransactionOfTypeMock).toHaveBeenCalledTimes(2);
    expect(addCreditsMock).toHaveBeenCalledTimes(1);
    expect(addCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 50,
        type: CREDIT_TRANSACTION_TYPE.REGISTER_GIFT,
        description: expect.stringContaining('Register gift credits'),
      }),
      undefined
    );
  });

  it('skips register gift when rule is missing', async () => {
    const policy = createPolicy();
    policy.getRegisterGiftRule = vi.fn().mockReturnValue(null);

    hasTransactionOfTypeMock.mockResolvedValue(false);

    const service = new CreditLedgerService(policy);

    await service.addRegisterGiftCredits('user-1');

    expect(addCreditsMock).not.toHaveBeenCalled();
  });

  it('grants monthly free credits once per period when rule exists', async () => {
    const rule: PlanCreditsRule = {
      enabled: true,
      amount: 20,
      expireDays: 15,
      isFree: true,
      isLifetime: false,
      disabled: false,
    };
    const policy = createPolicy();
    policy.getMonthlyFreeRule = vi.fn().mockReturnValue(rule);

    canAddCreditsByTypeMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const service = new CreditLedgerService(policy);
    const refDate = new Date('2025-03-01T00:00:00Z');

    await service.addMonthlyFreeCredits('user-1', 'free-plan', refDate);
    await service.addMonthlyFreeCredits('user-1', 'free-plan', refDate);

    expect(canAddCreditsByTypeMock).toHaveBeenCalledTimes(2);
    expect(addCreditsMock).toHaveBeenCalledTimes(1);

    const firstCall = addCreditsMock.mock.calls[0];
    if (!firstCall) {
      throw new Error('Expected addCreditsMock to have been called');
    }
    const [payload, tx] = firstCall;
    expect(tx).toBeUndefined();
    expect(payload).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        amount: 20,
        type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
        description: expect.stringContaining('Free monthly credits'),
        periodKey: expect.any(Number),
        expireDays: 15,
      })
    );
  });

  it('skips monthly free credits when rule is missing', async () => {
    const policy = createPolicy();
    policy.getMonthlyFreeRule = vi.fn().mockReturnValue(null);

    canAddCreditsByTypeMock.mockResolvedValue(true);

    const service = new CreditLedgerService(policy);

    await service.addMonthlyFreeCredits('user-1', 'free-plan');

    expect(addCreditsMock).not.toHaveBeenCalled();
  });
});
