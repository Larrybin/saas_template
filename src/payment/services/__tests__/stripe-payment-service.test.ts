import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { websiteConfig } from '@/config/website';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import type { BillingService } from '@/domain/billing';
import { withTestCreditsConfig } from '../../../../tests/utils/credits-config';
import { PaymentTypes } from '../../types';
import { PaymentSecurityError } from '../errors';
import type { NotificationGateway } from '../gateways/notification-gateway';
import type {
  PaymentRepositoryLike,
  StripeClientLike,
  StripeEventRepositoryLike,
  StripeWebhookEventLike,
  UserRepositoryLike,
} from '../stripe-deps';
import { StripePaymentService } from '../stripe-payment-service';

type EventProcessingMeta = Parameters<
  StripeEventRepositoryLike['withEventProcessingLock']
>[0];

type EventProcessingHandler = Parameters<
  StripeEventRepositoryLike['withEventProcessingLock']
>[1];

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/lib/price-plan', () => ({
  findPlanByPlanId: vi.fn(() => ({
    id: 'pro',
    prices: [
      {
        priceId: 'price_123',
        type: PaymentTypes.SUBSCRIPTION,
      },
    ],
  })),
  findPriceInPlan: vi.fn(() => ({
    priceId: 'price_123',
    type: PaymentTypes.SUBSCRIPTION,
    allowPromotionCode: true,
  })),
  findPlanByPriceId: vi.fn(() => ({
    id: 'pro',
    credits: { enable: true, amount: 100, expireDays: 30 },
  })),
}));

vi.mock('@/credits/server', () => ({
  getCreditPackageById: vi.fn(() => ({
    id: 'pkg_basic',
    amount: 25,
    expireDays: 30,
    price: { priceId: 'price_credit' },
  })),
}));

function createCheckoutCompletedEvent({
  sessionId,
  metadata,
  amountTotal,
}: {
  sessionId: string;
  metadata: {
    userId?: string;
    packageId?: string;
    credits?: string;
    priceId?: string;
    type?: string;
  };
  amountTotal: number;
}): StripeWebhookEventLike {
  return {
    id: `evt_${sessionId}`,
    type: 'checkout.session.completed',
    created: 1,
    data: {
      object: {
        id: sessionId,
        mode: 'payment',
        customer: 'cus_123',
        amount_total: amountTotal,
        metadata,
      },
    },
  };
}

function createSubscriptionUpdatedEvent({
  eventId,
  subscriptionId,
  customerId,
  userId,
  status,
  priceId,
  currentPeriodStart,
  currentPeriodEnd,
}: {
  eventId: string;
  subscriptionId: string;
  customerId: string;
  userId: string;
  status: string;
  priceId: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
}): StripeWebhookEventLike {
  return {
    id: eventId,
    type: 'customer.subscription.updated',
    created: 1,
    data: {
      object: {
        id: subscriptionId,
        customer: customerId,
        status,
        cancel_at_period_end: false,
        metadata: { userId },
        trial_start: null,
        trial_end: null,
        items: {
          data: [
            {
              price: {
                id: priceId,
                recurring: { interval: 'month' },
              },
              current_period_start: currentPeriodStart,
              current_period_end: currentPeriodEnd,
            },
          ],
        },
      },
    },
  };
}

const createStripeStub = (): StripeClientLike => {
  const sessionsCreate: StripeClientLike['checkout']['sessions']['create'] =
    async (params, options) => {
      void params;
      void options;
      return {
        id: 'sess_123',
        url: 'https://stripe.test/session',
      };
    };

  const billingPortalCreate: StripeClientLike['billingPortal']['sessions']['create'] =
    async (params, options) => {
      void params;
      void options;
      return {
        url: 'https://stripe.test/portal',
      };
    };

  const customersList: StripeClientLike['customers']['list'] = async (
    params,
    options
  ) => {
    void params;
    void options;
    return {
      data: [],
    };
  };

  const customersCreate: StripeClientLike['customers']['create'] = async (
    params,
    options
  ) => {
    void params;
    void options;
    return {
      id: 'cus_123',
    };
  };

  const constructEvent: StripeClientLike['webhooks']['constructEvent'] = vi.fn(
    (
      payload: string | Buffer,
      header: string | string[] | Buffer,
      secret: string
    ) => {
      void payload;
      void header;
      void secret;
      return {
        id: 'evt_test',
        type: 'checkout.session.completed',
        created: Date.now() / 1000,
        data: { object: {} },
      } as Stripe.Event;
    }
  );

  return {
    checkout: {
      sessions: {
        create: vi.fn(sessionsCreate),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(billingPortalCreate),
      },
    },
    customers: {
      list: vi.fn(customersList),
      create: vi.fn(customersCreate),
    },
    webhooks: {
      constructEvent,
    },
  };
};

const createService = (
  overrides: {
    stripe?: StripeClientLike;
    creditsGateway?: Partial<CreditsGateway>;
    notificationGateway?: Partial<NotificationGateway>;
    userRepository?: UserRepositoryLike;
    paymentRepository?: PaymentRepositoryLike;
    stripeEventRepository?: StripeEventRepositoryLike;
    billingService?: BillingService;
  } = {}
) => {
  const stripe = overrides.stripe ?? createStripeStub();
  const creditsGateway =
    overrides.creditsGateway ??
    ({
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    } satisfies Partial<CreditsGateway>);
  const notificationGateway =
    overrides.notificationGateway ??
    ({
      notifyPurchase: vi.fn(),
    } satisfies Partial<NotificationGateway>);
  const userRepository =
    overrides.userRepository ??
    ({
      findUserIdByCustomerId: vi.fn().mockResolvedValue(undefined),
      linkCustomerIdToUser: vi.fn().mockResolvedValue('user-db-id'),
    } satisfies UserRepositoryLike);
  const paymentRepository =
    overrides.paymentRepository ??
    ({
      listByUser: vi.fn().mockResolvedValue([]),
      findOneBySubscriptionId: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: vi.fn(),
      upsertSubscription: vi.fn(),
      withTransaction: vi
        .fn()
        .mockImplementation(
          async (handler: (tx: unknown) => Promise<unknown>) => handler({})
        ),
    } satisfies PaymentRepositoryLike);
  const stripeEventRepository =
    overrides.stripeEventRepository ??
    ({
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(
          async (
            _meta: EventProcessingMeta,
            handler: EventProcessingHandler
          ) => {
            await handler();
            return { skipped: false };
          }
        ),
    } satisfies StripeEventRepositoryLike);
  const billingService =
    overrides.billingService ??
    ({
      startSubscriptionCheckout: vi.fn(),
      startCreditCheckout: vi.fn(),
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    } satisfies BillingService);

  const service = new StripePaymentService({
    stripeClient: stripe,
    webhookSecret: 'whsec_test',
    creditsGateway: creditsGateway as CreditsGateway,
    notificationGateway: notificationGateway as NotificationGateway,
    userRepository,
    paymentRepository,
    stripeEventRepository,
    billingService,
  });

  return {
    service,
    stripe,
    creditsGateway,
    notificationGateway,
    userRepository,
    paymentRepository,
    stripeEventRepository,
    billingService,
  };
};

describe('StripePaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches plan metadata and idempotency key on checkout', async () => {
    await withTestCreditsConfig(
      { ...(websiteConfig.credits ?? {}), enableCredits: true },
      async () => {
        const stripe = createStripeStub();
        const { service } = createService({ stripe });

        await service.createCheckout({
          planId: 'pro',
          priceId: 'price_123',
          customerEmail: 'user@example.com',
          successUrl: 'https://app.test/success',
          cancelUrl: 'https://app.test/cancel',
          metadata: { userName: 'Jane' },
          locale: 'en',
        });

        expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              planId: 'pro',
              priceId: 'price_123',
            }),
          }),
          expect.objectContaining({
            idempotencyKey: expect.any(String),
          })
        );
      }
    );
  });

  it('creates credit checkout with sanitized metadata', async () => {
    await withTestCreditsConfig(
      { ...(websiteConfig.credits ?? {}), enableCredits: true },
      async () => {
        const stripe = createStripeStub();
        const { service } = createService({ stripe });

        await service.createCreditCheckout({
          packageId: 'pkg_basic',
          customerEmail: 'user@example.com',
          successUrl: 'https://app.test/success',
          cancelUrl: 'https://app.test/cancel',
          metadata: { userName: 'Jane', '<script>': 'bad' },
          locale: 'en',
        });

        expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            line_items: [{ price: 'price_credit', quantity: 1 }],
            metadata: expect.objectContaining({
              packageId: 'pkg_basic',
              priceId: 'price_credit',
              type: 'credit_purchase',
              userName: 'Jane',
            }),
          }),
          expect.objectContaining({
            idempotencyKey: expect.any(String),
          })
        );
      }
    );
  });

  it('rejects credit checkout when client price mismatches package', async () => {
    await withTestCreditsConfig(
      { ...(websiteConfig.credits ?? {}), enableCredits: true },
      async () => {
        const stripe = createStripeStub();
        const { service } = createService({ stripe });

        await expect(
          service.createCreditCheckout({
            packageId: 'pkg_basic',
            priceId: 'price_other',
            customerEmail: 'user@example.com',
            successUrl: 'https://app.test/success',
            cancelUrl: 'https://app.test/cancel',
            metadata: { userName: 'Jane' },
            locale: 'en',
          })
        ).rejects.toThrowError(PaymentSecurityError);

        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      }
    );
  });

  it('processes credit purchase inside a transaction and grants credits', async () => {
    const stripe = createStripeStub();
    const event = createCheckoutCompletedEvent({
      sessionId: 'cs_test',
      amountTotal: 2500,
      metadata: {
        userId: 'user-1',
        packageId: 'pkg_basic',
        credits: '25',
        type: 'credit_purchase',
        priceId: 'price_credit',
      },
    });
    (stripe.webhooks.constructEvent as any).mockReturnValue(event);
    const tx = { id: 'tx' };
    const creditsGateway = {
      addCredits: vi.fn().mockResolvedValue(undefined),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };
    const paymentRepository = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockResolvedValue('payment-id'),
      upsertSubscription: vi.fn(),
      withTransaction: vi
        .fn()
        .mockImplementation(
          async (handler: (tx: unknown) => Promise<unknown>) => handler(tx)
        ),
    };
    const stripeEventRepository = {
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(
          async (
            _meta: EventProcessingMeta,
            handler: EventProcessingHandler
          ) => {
            await handler();
            return { skipped: false };
          }
        ),
    };
    const { service } = createService({
      stripe,
      creditsGateway,
      paymentRepository,
      stripeEventRepository,
    });

    await service.handleWebhookEvent('payload', 'signature');

    expect(paymentRepository.withTransaction).toHaveBeenCalledTimes(1);
    expect(paymentRepository.findBySessionId).toHaveBeenCalledWith(
      'cs_test',
      tx
    );
    expect(creditsGateway.addCredits).toHaveBeenCalled();
    const txWrapper = creditsGateway.addCredits.mock.calls[0]?.[1];
    expect(txWrapper?.unwrap()).toBe(tx);
  });

  it('propagates failures when credit grant throws so webhook can retry', async () => {
    const stripe = createStripeStub();
    const event = createCheckoutCompletedEvent({
      sessionId: 'cs_test',
      amountTotal: 2500,
      metadata: {
        userId: 'user-1',
        packageId: 'pkg_basic',
        credits: '25',
        type: 'credit_purchase',
        priceId: 'price_credit',
      },
    });
    (stripe.webhooks.constructEvent as any).mockReturnValue(event);
    const tx = { id: 'tx' };
    const creditsGateway = {
      addCredits: vi.fn().mockRejectedValue(new Error('grant failed')),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };
    const paymentRepository = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockResolvedValue('payment-id'),
      upsertSubscription: vi.fn(),
      withTransaction: vi
        .fn()
        .mockImplementation(
          async (handler: (tx: unknown) => Promise<unknown>) => handler(tx)
        ),
    };
    const stripeEventRepository = {
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(
          async (
            _meta: EventProcessingMeta,
            handler: EventProcessingHandler
          ) => {
            await handler();
            return { skipped: false };
          }
        ),
    };
    const { service } = createService({
      stripe,
      creditsGateway,
      paymentRepository,
      stripeEventRepository,
    });

    await expect(
      service.handleWebhookEvent('payload', 'signature')
    ).rejects.toThrow('grant failed');
    expect(paymentRepository.insert).toHaveBeenCalled();
    const txWrapper = creditsGateway.addCredits.mock.calls[0]?.[1];
    expect(txWrapper?.unwrap()).toBe(tx);
    expect(stripeEventRepository.withEventProcessingLock).toHaveBeenCalled();
  });

  it('grants lifetime monthly credits for standard checkout sessions', async () => {
    const stripe = createStripeStub();
    const event = createCheckoutCompletedEvent({
      sessionId: 'cs_one_time',
      amountTotal: 9900,
      metadata: {
        userId: 'user-1',
        priceId: 'price_lifetime',
      },
    });
    (stripe.webhooks.constructEvent as any).mockReturnValue(event);
    const tx = { id: 'tx-onetime' };
    const billingService = {
      startSubscriptionCheckout: vi.fn(),
      startCreditCheckout: vi.fn(),
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    } satisfies BillingService;
    const notificationGateway = {
      notifyPurchase: vi.fn(),
    };
    const paymentRepository = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockResolvedValue('payment-id'),
      upsertSubscription: vi.fn(),
      withTransaction: vi
        .fn()
        .mockImplementation(
          async (handler: (tx: unknown) => Promise<unknown>) => handler(tx)
        ),
    };
    const stripeEventRepository = {
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(
          async (
            _meta: EventProcessingMeta,
            handler: EventProcessingHandler
          ) => {
            await handler();
            return { skipped: false };
          }
        ),
    };
    const { service } = createService({
      stripe,
      paymentRepository,
      stripeEventRepository,
      notificationGateway,
      billingService,
    });

    await service.handleWebhookEvent('payload', 'signature');

    expect(paymentRepository.findBySessionId).toHaveBeenCalledWith(
      'cs_one_time',
      tx
    );
    expect(billingService.grantLifetimePlan).toHaveBeenCalledWith({
      userId: 'user-1',
      priceId: 'price_lifetime',
      cycleRefDate: expect.any(Date),
      transaction: expect.anything(),
    });
    const lifetimeTx =
      billingService.grantLifetimePlan.mock.calls[0]?.[0]?.transaction;
    expect(lifetimeTx?.unwrap()).toBe(tx);
    expect(notificationGateway.notifyPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'cs_one_time', amount: 99 })
    );
  });

  it('handles subscription renewal and awards credits', async () => {
    const stripe = createStripeStub();
    const event = createSubscriptionUpdatedEvent({
      eventId: 'evt_123',
      subscriptionId: 'sub_123',
      customerId: 'cus_456',
      userId: 'user-1',
      status: 'active',
      priceId: 'price_123',
      currentPeriodStart: 1,
      currentPeriodEnd: 2,
    });
    (stripe.webhooks.constructEvent as any).mockReturnValue(event);
    const billingService = {
      startSubscriptionCheckout: vi.fn(),
      startCreditCheckout: vi.fn(),
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    } satisfies BillingService;
    const tx = { id: 'tx-sub' };
    const paymentRepository = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn().mockResolvedValue({
        userId: 'user-1',
        periodStart: new Date(0),
      }),
      updateBySubscriptionId: vi.fn().mockResolvedValue('payment-id'),
      findBySessionId: vi.fn(),
      insert: vi.fn(),
      upsertSubscription: vi.fn(),
      withTransaction: vi
        .fn()
        .mockImplementation(
          async (handler: (tx: unknown) => Promise<unknown>) => handler(tx)
        ),
    };
    const stripeEventRepository = {
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(
          async (
            _meta: EventProcessingMeta,
            handler: EventProcessingHandler
          ) => {
            await handler();
            return { skipped: false };
          }
        ),
    };
    const { service } = createService({
      stripe,
      paymentRepository,
      stripeEventRepository,
      billingService,
    });

    await service.handleWebhookEvent('payload', 'signature');

    const subTxWrapper =
      billingService.handleRenewal.mock.calls[0]?.[0]?.transaction;
    expect(subTxWrapper?.unwrap()).toBe(tx);
    expect(paymentRepository.withTransaction).toHaveBeenCalled();
    expect(stripeEventRepository.withEventProcessingLock).toHaveBeenCalled();
  });

  it('bubbles failures when subscription credit grant fails', async () => {
    const stripe = createStripeStub();
    const event = createSubscriptionUpdatedEvent({
      eventId: 'evt_124',
      subscriptionId: 'sub_456',
      customerId: 'cus_789',
      userId: 'user-1',
      status: 'active',
      priceId: 'price_123',
      currentPeriodStart: 1,
      currentPeriodEnd: 2,
    });
    (stripe.webhooks.constructEvent as any).mockReturnValue(event);
    const tx = { id: 'tx-sub-fail' };
    const billingService = {
      startSubscriptionCheckout: vi.fn(),
      startCreditCheckout: vi.fn(),
      handleRenewal: vi.fn().mockRejectedValue(new Error('sub grant fail')),
      grantLifetimePlan: vi.fn(),
    } satisfies BillingService;
    const paymentRepository = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn().mockResolvedValue({
        userId: 'user-1',
        periodStart: new Date(0),
      }),
      updateBySubscriptionId: vi.fn().mockResolvedValue('payment-id'),
      findBySessionId: vi.fn(),
      insert: vi.fn(),
      upsertSubscription: vi.fn(),
      withTransaction: vi
        .fn()
        .mockImplementation(
          async (handler: (tx: unknown) => Promise<unknown>) => handler(tx)
        ),
    };
    const stripeEventRepository = {
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(
          async (
            _meta: EventProcessingMeta,
            handler: EventProcessingHandler
          ) => {
            await handler();
            return { skipped: false };
          }
        ),
    };
    const { service } = createService({
      stripe,
      paymentRepository,
      stripeEventRepository,
      billingService,
    });

    await expect(
      service.handleWebhookEvent('payload', 'signature')
    ).rejects.toThrow('sub grant fail');
    const subTxWrapper =
      billingService.handleRenewal.mock.calls[0]?.[0]?.transaction;
    expect(subTxWrapper?.unwrap()).toBe(tx);
    expect(paymentRepository.updateBySubscriptionId).toHaveBeenCalled();
    expect(paymentRepository.withTransaction).toHaveBeenCalled();
  });
});
