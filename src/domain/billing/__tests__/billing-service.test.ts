import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '@/credits/data-access/types';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import { CreditsTransaction } from '@/credits/services/transaction-context';
import { DefaultBillingService } from '@/domain/billing/billing-service';
import type { PlanPolicy } from '@/domain/billing/plan-policy';
import type { UserLifetimeMembershipRepository } from '@/payment/data-access/user-lifetime-membership-repository';
import type {
  CheckoutResult,
  PaymentProvider,
  PricePlan,
} from '@/payment/types';
import { PaymentTypes, PlanIntervals } from '@/payment/types';

const mockPlan: PricePlan = {
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
    amount: 100,
  },
};

const createPaymentProvider = () => {
  return {
    createCheckout: vi
      .fn<
        [Parameters<PaymentProvider['createCheckout']>[0]],
        Promise<CheckoutResult>
      >()
      .mockResolvedValue({
        url: 'https://checkout.example.com',
        id: 'chk_123',
      }),
    createCreditCheckout: vi.fn(),
    createCustomerPortal: vi.fn(),
    getSubscriptions: vi.fn(),
    handleWebhookEvent: vi.fn(),
  } satisfies PaymentProvider;
};

const createPlanPolicy = (): PlanPolicy => ({
  getPlanById: vi.fn().mockReturnValue(mockPlan),
  getPlanByPriceId: vi.fn().mockReturnValue(mockPlan),
  getPlanCreditsConfigByPlanId: vi.fn().mockReturnValue({
    enabled: true,
    amount: 100,
    expireDays: undefined,
    isFree: false,
    isLifetime: false,
    disabled: false,
  }),
  getPlanCreditsConfigByPriceId: vi.fn().mockReturnValue({
    enabled: true,
    amount: 100,
    expireDays: undefined,
    isFree: false,
    isLifetime: false,
    disabled: false,
  }),
});

const createCreditsGateway = (): CreditsGateway => ({
  addCredits: vi.fn(),
  addSubscriptionCredits: vi.fn(),
  addLifetimeMonthlyCredits: vi.fn(),
});

describe('DefaultBillingService', () => {
  it('creates checkout session after validating plan and price', async () => {
    const paymentProvider = createPaymentProvider();
    const service = new DefaultBillingService({
      paymentProvider,
      creditsGateway: createCreditsGateway(),
      planPolicy: createPlanPolicy(),
      creditsEnabled: true,
    });

    const result = await service.startSubscriptionCheckout({
      planId: 'plan_basic',
      priceId: 'price_basic',
      customerEmail: 'user@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });

    expect(result.id).toBe('chk_123');
    expect(paymentProvider.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan_basic',
        priceId: 'price_basic',
        customerEmail: 'user@example.com',
      })
    );
  });

  it('grants subscription credits on renewal when enabled', async () => {
    const creditsGateway = createCreditsGateway();
    const service = new DefaultBillingService({
      paymentProvider: createPaymentProvider(),
      creditsGateway,
      planPolicy: createPlanPolicy(),
      creditsEnabled: true,
    });

    const cycleRefDate = new Date('2025-01-01');

    await service.handleRenewal({
      userId: 'user_1',
      priceId: 'price_basic',
      cycleRefDate,
    });

    expect(creditsGateway.addSubscriptionCredits).toHaveBeenCalledWith(
      'user_1',
      'price_basic',
      cycleRefDate,
      undefined
    );
  });

  it('skips renewal handling when credits are globally disabled', async () => {
    const creditsGateway = createCreditsGateway();
    const service = new DefaultBillingService({
      paymentProvider: createPaymentProvider(),
      creditsGateway,
      planPolicy: createPlanPolicy(),
      creditsEnabled: false,
    });

    await service.handleRenewal({
      userId: 'user_1',
      priceId: 'price_basic',
      cycleRefDate: new Date('2025-01-01'),
    });

    expect(creditsGateway.addSubscriptionCredits).not.toHaveBeenCalled();
  });

  it('skips renewal handling when subscription credits config is missing', async () => {
    const creditsGateway = createCreditsGateway();
    const planPolicy = createPlanPolicy();

    planPolicy.getPlanCreditsConfigByPriceId = vi
      .fn()
      .mockReturnValueOnce(null);

    const service = new DefaultBillingService({
      paymentProvider: createPaymentProvider(),
      creditsGateway,
      planPolicy,
      creditsEnabled: true,
    });

    await service.handleRenewal({
      userId: 'user_1',
      priceId: 'price_basic',
      cycleRefDate: new Date('2025-01-01'),
    });

    expect(creditsGateway.addSubscriptionCredits).not.toHaveBeenCalled();
  });

  it('throws when plan is not found', async () => {
    const planPolicy: PlanPolicy = {
      getPlanById: vi.fn().mockReturnValue(undefined),
      getPlanByPriceId: vi.fn().mockReturnValue(undefined),
      getPlanCreditsConfigByPlanId: vi.fn().mockReturnValue(null),
      getPlanCreditsConfigByPriceId: vi.fn().mockReturnValue(null),
    };
    const service = new DefaultBillingService({
      paymentProvider: createPaymentProvider(),
      creditsGateway: createCreditsGateway(),
      planPolicy,
      creditsEnabled: true,
    });
    await expect(
      service.startSubscriptionCheckout({
        planId: 'missing',
        priceId: 'foo',
        customerEmail: 'user@example.com',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })
    ).rejects.toThrow('Price plan not found or disabled');
  });

  it('skips lifetime grant when plan is not lifetime', async () => {
    const creditsGateway = createCreditsGateway();
    const planPolicy: PlanPolicy = {
      getPlanById: vi.fn().mockReturnValue(mockPlan),
      getPlanByPriceId: vi.fn().mockReturnValue(mockPlan),
      getPlanCreditsConfigByPlanId: vi.fn().mockReturnValue(null),
      getPlanCreditsConfigByPriceId: vi.fn().mockReturnValue({
        enabled: true,
        amount: 100,
        isFree: false,
        isLifetime: false,
        disabled: false,
      }),
    };
    const service = new DefaultBillingService({
      paymentProvider: createPaymentProvider(),
      creditsGateway,
      planPolicy,
      creditsEnabled: true,
    });
    await service.grantLifetimePlan({
      userId: 'user_1',
      priceId: 'price_basic',
    });
    expect(creditsGateway.addLifetimeMonthlyCredits).not.toHaveBeenCalled();
  });

  it('passes resolved executor to lifetime membership repository', async () => {
    const creditsGateway = createCreditsGateway();
    const lifetimePlan: PricePlan = {
      ...mockPlan,
      isLifetime: true,
      credits: {
        enable: true,
        amount: 100,
      },
    };
    const planPolicy: PlanPolicy = {
      getPlanById: vi.fn().mockReturnValue(lifetimePlan),
      getPlanByPriceId: vi.fn().mockReturnValue(lifetimePlan),
      getPlanCreditsConfigByPlanId: vi.fn().mockReturnValue({
        enabled: true,
        amount: 100,
        expireDays: undefined,
        isFree: false,
        isLifetime: true,
        disabled: false,
      }),
      getPlanCreditsConfigByPriceId: vi.fn().mockReturnValue({
        enabled: true,
        amount: 100,
        expireDays: undefined,
        isFree: false,
        isLifetime: true,
        disabled: false,
      }),
    };
    const membershipRepository: Pick<
      UserLifetimeMembershipRepository,
      'upsertMembership'
    > = {
      upsertMembership: vi.fn(),
    };
    const service = new DefaultBillingService({
      paymentProvider: createPaymentProvider(),
      creditsGateway,
      planPolicy,
      creditsEnabled: true,
      lifetimeMembershipRepository:
        membershipRepository as UserLifetimeMembershipRepository,
    });
    const executor = {} as DbExecutor;
    const transaction = new CreditsTransaction(executor);

    await service.grantLifetimePlan({
      userId: 'user_1',
      priceId: 'price_basic',
      transaction,
    });

    expect(membershipRepository.upsertMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        priceId: 'price_basic',
      }),
      executor
    );
  });
});
