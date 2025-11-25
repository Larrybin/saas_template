import { describe, expect, it, vi } from 'vitest';
import { CreditsPlanPolicyMissingError } from '@/credits/domain/errors';
import type { PlanCreditsPolicy } from '@/credits/domain/plan-credits-policy';
import { CreditLedgerService } from '@/credits/services/credit-ledger-service';

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

describe('CreditLedgerService and PlanCreditsPolicy integration', () => {
  const createPolicy = (): PlanCreditsPolicy => ({
    getRegisterGiftRule: vi.fn(),
    getMonthlyFreeRule: vi.fn(),
    getSubscriptionRenewalRule: vi.fn(),
    getLifetimeMonthlyRule: vi.fn(),
    resolveCurrentPlan: vi.fn() as any,
  });

  it('throws CreditsPlanPolicyMissingError when subscription renewal rule is missing', async () => {
    const policy = createPolicy();
    policy.getSubscriptionRenewalRule = vi.fn().mockReturnValue(null);

    const service = new CreditLedgerService(policy);

    await expect(
      service.addSubscriptionCredits(
        'user-1',
        'price-basic',
        new Date('2025-01-01')
      )
    ).rejects.toBeInstanceOf(CreditsPlanPolicyMissingError);
  });

  it('throws CreditsPlanPolicyMissingError when lifetime monthly rule is missing', async () => {
    const policy = createPolicy();
    policy.getLifetimeMonthlyRule = vi.fn().mockReturnValue(null);

    const service = new CreditLedgerService(policy);

    await expect(
      service.addLifetimeMonthlyCredits(
        'user-1',
        'price-lifetime',
        new Date('2025-01-01')
      )
    ).rejects.toBeInstanceOf(CreditsPlanPolicyMissingError);
  });
});
