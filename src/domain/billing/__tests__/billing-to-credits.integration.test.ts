import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreditTransactionInsert,
  CreditTransactionRecord,
  UserCreditRecord,
} from '@/credits/data-access/credit-ledger-repository.interface';
import type {
  PlanCreditsPolicy,
  PlanCreditsRule,
} from '@/credits/domain/plan-credits-policy';
import {
  CreditLedgerService,
  creditLedgerRepository,
} from '@/credits/services/credit-ledger-service';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { getDb } from '@/db';
import { DefaultBillingService } from '@/domain/billing/billing-service';
import type { PlanPolicy } from '@/domain/billing/plan-policy';
import type { UserLifetimeMembershipRepository } from '@/payment/data-access/user-lifetime-membership-repository';
import type { PaymentProvider, PricePlan } from '@/payment/types';
import { PaymentTypes, PlanIntervals } from '@/payment/types';

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

type GetDbMock = {
  mockResolvedValue: (value: unknown) => void;
};

describe('Billing -> Credits integration (happy path)', () => {
  const subscriptionRule: PlanCreditsRule = {
    enabled: true,
    amount: 100,
    isFree: false,
    isLifetime: false,
    disabled: false,
  };

  const lifetimeRule: PlanCreditsRule = {
    enabled: true,
    amount: 200,
    isFree: false,
    isLifetime: true,
    disabled: false,
  };

  const createPaymentProvider = (): PaymentProvider => ({
    createCheckout: vi.fn(),
    createCreditCheckout: vi.fn(),
    createCustomerPortal: vi.fn(),
    getSubscriptions: vi.fn(),
    handleWebhookEvent: vi.fn(),
  });

  const createPlanPolicyForBilling = (): PlanPolicy => {
    const plan: PricePlan = {
      id: 'plan_basic',
      name: 'Basic',
      description: '',
      features: [],
      limits: [],
      prices: [
        {
          type: PaymentTypes.SUBSCRIPTION,
          priceId: 'price_basic',
          amount: 1200,
          currency: 'USD',
          interval: PlanIntervals.MONTH,
          allowPromotionCode: false,
        },
      ],
      isFree: false,
      isLifetime: false,
      popular: false,
      disabled: false,
      credits: {
        enable: true,
        amount: subscriptionRule.amount,
      },
    };

    return {
      getPlanById: vi.fn().mockReturnValue(plan),
      getPlanByPriceId: vi.fn().mockReturnValue(plan),
      getPlanCreditsConfigByPlanId: vi.fn().mockReturnValue({
        enabled: true,
        amount: subscriptionRule.amount,
        isFree: false,
        isLifetime: false,
        disabled: false,
      }),
      getPlanCreditsConfigByPriceId: vi.fn().mockReturnValue({
        enabled: true,
        amount: subscriptionRule.amount,
        isFree: false,
        isLifetime: false,
        disabled: false,
      }),
    };
  };

  const createPlanCreditsPolicyForCredits = (): PlanCreditsPolicy => ({
    getRegisterGiftRule: vi.fn().mockReturnValue(null),
    getMonthlyFreeRule: vi.fn().mockReturnValue(null),
    getSubscriptionRenewalRule: vi
      .fn()
      .mockImplementation((priceId: string) =>
        priceId === 'price_basic' ? subscriptionRule : null
      ),
    getLifetimeMonthlyRule: vi.fn().mockReturnValue(null),
    resolveCurrentPlan: vi.fn() as any,
  });

  const balances = new Map<string, number>();
  const transactions: CreditTransactionInsert[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    balances.clear();
    transactions.length = 0;

    const mockedGetDb = getDb as unknown as GetDbMock;
    mockedGetDb.mockResolvedValue({} as unknown);

    vi.spyOn(creditLedgerRepository, 'findUserCredit').mockImplementation(
      async (userId: string): Promise<UserCreditRecord | undefined> => {
        const currentCredits = balances.get(userId);
        if (currentCredits === undefined) {
          return undefined;
        }
        return {
          id: `ledger-${userId}`,
          userId,
          currentCredits,
          lastRefreshAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as UserCreditRecord;
      }
    );

    vi.spyOn(creditLedgerRepository, 'upsertUserCredit').mockImplementation(
      async (userId: string, credits: number) => {
        balances.set(userId, credits);
      }
    );

    vi.spyOn(creditLedgerRepository, 'insertTransaction').mockImplementation(
      async (values: CreditTransactionInsert) => {
        transactions.push(values);
      }
    );

    vi.spyOn(
      creditLedgerRepository,
      'findTransactionByTypeAndPeriodKey'
    ).mockImplementation(
      async (
        userId: string,
        creditType: string,
        periodKey: number,
        _db
      ): Promise<CreditTransactionRecord | undefined> => {
        const found = transactions.find(
          (tx) =>
            tx.userId === userId &&
            tx.type === creditType &&
            tx.periodKey === periodKey
        );
        return found as unknown as CreditTransactionRecord | undefined;
      }
    );
  });

  it('grants subscription renewal credits from BillingService down to CreditLedgerRepository', async () => {
    const paymentProvider = createPaymentProvider();
    const billingPlanPolicy = createPlanPolicyForBilling();
    const planCreditsPolicy = createPlanCreditsPolicyForCredits();

    const creditsGateway = new CreditLedgerService(planCreditsPolicy);
    const billingService = new DefaultBillingService({
      paymentProvider,
      creditsGateway,
      planPolicy: billingPlanPolicy,
      creditsEnabled: true,
    });

    const refDate = new Date('2025-01-01T00:00:00Z');

    await billingService.handleRenewal({
      userId: 'user-1',
      priceId: 'price_basic',
      cycleRefDate: refDate,
    });

    expect(balances.get('user-1')).toBe(subscriptionRule.amount);

    expect(transactions).toHaveLength(1);
    const tx = transactions[0] as CreditTransactionInsert;
    expect(tx.userId).toBe('user-1');
    expect(tx.type).toBe(CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL);
    expect(tx.amount).toBe(subscriptionRule.amount);
    expect(tx.remainingAmount).toBe(subscriptionRule.amount);
    expect(tx.periodKey).toBeGreaterThan(0);
  });

  const createPlanPolicyForBillingLifetime = (): PlanPolicy => {
    const plan: PricePlan = {
      id: 'plan_lifetime',
      name: 'Lifetime',
      description: '',
      features: [],
      limits: [],
      prices: [
        {
          type: PaymentTypes.ONE_TIME,
          priceId: 'price_lifetime',
          amount: 19900,
          currency: 'USD',
          allowPromotionCode: true,
        },
      ],
      isFree: false,
      isLifetime: true,
      popular: false,
      disabled: false,
      credits: {
        enable: true,
        amount: lifetimeRule.amount,
      },
    };

    return {
      getPlanById: vi.fn().mockReturnValue(plan),
      getPlanByPriceId: vi.fn().mockReturnValue(plan),
      getPlanCreditsConfigByPlanId: vi.fn().mockReturnValue({
        enabled: true,
        amount: lifetimeRule.amount,
        isFree: false,
        isLifetime: true,
        disabled: false,
      }),
      getPlanCreditsConfigByPriceId: vi.fn().mockReturnValue({
        enabled: true,
        amount: lifetimeRule.amount,
        isFree: false,
        isLifetime: true,
        disabled: false,
      }),
    };
  };

  const createPlanCreditsPolicyForCreditsLifetime = (): PlanCreditsPolicy => ({
    getRegisterGiftRule: vi.fn().mockReturnValue(null),
    getMonthlyFreeRule: vi.fn().mockReturnValue(null),
    getSubscriptionRenewalRule: vi.fn().mockReturnValue(null),
    getLifetimeMonthlyRule: vi
      .fn()
      .mockImplementation((priceId: string) =>
        priceId === 'price_lifetime' ? lifetimeRule : null
      ),
    resolveCurrentPlan: vi.fn() as any,
  });

  it('grants lifetime monthly credits and upserts membership from BillingService', async () => {
    const paymentProvider = createPaymentProvider();
    const billingPlanPolicy = createPlanPolicyForBillingLifetime();
    const planCreditsPolicy = createPlanCreditsPolicyForCreditsLifetime();

    const creditsGateway = new CreditLedgerService(planCreditsPolicy);
    const membershipRepository: Pick<
      UserLifetimeMembershipRepository,
      'upsertMembership'
    > = {
      upsertMembership: vi.fn(),
    };

    const billingService = new DefaultBillingService({
      paymentProvider,
      creditsGateway,
      planPolicy: billingPlanPolicy,
      creditsEnabled: true,
      lifetimeMembershipRepository:
        membershipRepository as UserLifetimeMembershipRepository,
    });

    const refDate = new Date('2025-02-01T00:00:00Z');

    await billingService.grantLifetimePlan({
      userId: 'user-1',
      priceId: 'price_lifetime',
      cycleRefDate: refDate,
    });

    expect(balances.get('user-1')).toBe(lifetimeRule.amount);

    expect(transactions).toHaveLength(1);
    const tx = transactions[0] as CreditTransactionInsert;
    expect(tx.userId).toBe('user-1');
    expect(tx.type).toBe(CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY);
    expect(tx.amount).toBe(lifetimeRule.amount);
    expect(tx.remainingAmount).toBe(lifetimeRule.amount);
    expect(tx.periodKey).toBeGreaterThan(0);

    expect(membershipRepository.upsertMembership).toHaveBeenCalledTimes(1);
    expect(membershipRepository.upsertMembership).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        priceId: 'price_lifetime',
        cycleRefDate: refDate,
      },
      undefined
    );
  });
});
