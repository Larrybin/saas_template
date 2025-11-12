import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { websiteConfig } from '@/config/website';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import { PaymentTypes } from '../../types';
import { PaymentSecurityError } from '../errors';
import type { NotificationGateway } from '../gateways/notification-gateway';
import { StripePaymentService } from '../stripe-payment-service';

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

const createStripeStub = () => {
  const sessionsCreate = vi.fn().mockResolvedValue({
    id: 'sess_123',
    url: 'https://stripe.test/session',
  });
  const billingPortalCreate = vi.fn().mockResolvedValue({
    url: 'https://stripe.test/portal',
  });
  const customersList = vi.fn().mockResolvedValue({ data: [] });
  const customersCreate = vi.fn().mockResolvedValue({ id: 'cus_123' });
  const constructEvent = vi.fn();
  return {
    checkout: {
      sessions: {
        create: sessionsCreate,
      },
    },
    billingPortal: {
      sessions: {
        create: billingPortalCreate,
      },
    },
    customers: {
      list: customersList,
      create: customersCreate,
    },
    webhooks: {
      constructEvent,
    },
  } as unknown as Stripe;
};

const createService = (
  overrides: {
    stripe?: Stripe;
    creditsGateway?: Partial<CreditsGateway>;
    notificationGateway?: Partial<NotificationGateway>;
    userRepository?: any;
    paymentRepository?: any;
    stripeEventRepository?: any;
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
    } as const);
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
        .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
          handler({})
        ),
    } as const);
  const stripeEventRepository =
    overrides.stripeEventRepository ??
    ({
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(async (_meta, handler) => {
          await handler();
          return { skipped: false };
        }),
    } as const);

  const service = new StripePaymentService({
    stripeClient: stripe,
    webhookSecret: 'whsec_test',
    creditsGateway: creditsGateway as CreditsGateway,
    notificationGateway: notificationGateway as NotificationGateway,
    userRepository: userRepository as any,
    paymentRepository: paymentRepository as any,
    stripeEventRepository: stripeEventRepository as any,
  });

  return {
    service,
    stripe,
    creditsGateway,
    notificationGateway,
    userRepository,
    paymentRepository,
    stripeEventRepository,
  };
};

describe('StripePaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (websiteConfig as any).credits = {
      ...(websiteConfig.credits ?? {}),
      enableCredits: true,
    };
  });

  it('attaches plan metadata and idempotency key on checkout', async () => {
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
  });

  it('creates credit checkout with sanitized metadata', async () => {
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
  });

  it('rejects credit checkout when client price mismatches package', async () => {
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
  });

  it('processes credit purchase inside a transaction and grants credits', async () => {
    const stripe = createStripeStub();
    const checkoutSession = {
      id: 'cs_test',
      mode: 'payment',
      metadata: {
        userId: 'user-1',
        packageId: 'pkg_basic',
        credits: '25',
        type: 'credit_purchase',
        priceId: 'price_credit',
      },
      customer: 'cus_123',
      amount_total: 2500,
    } as unknown as Stripe.Checkout.Session;
    const event = {
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      created: 1,
      data: { object: checkoutSession },
    } as Stripe.Event;
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
        .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
          handler(tx)
        ),
    };
    const stripeEventRepository = {
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(async (_meta, handler) => {
          await handler();
          return { skipped: false };
        }),
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
    const txWrapper = creditsGateway.addCredits.mock.calls[0][1];
    expect(txWrapper?.unwrap()).toBe(tx);
  });

  it('propagates failures when credit grant throws so webhook can retry', async () => {
    const stripe = createStripeStub();
    const checkoutSession = {
      id: 'cs_test',
      mode: 'payment',
      metadata: {
        userId: 'user-1',
        packageId: 'pkg_basic',
        credits: '25',
        type: 'credit_purchase',
        priceId: 'price_credit',
      },
      customer: 'cus_123',
      amount_total: 2500,
    } as unknown as Stripe.Checkout.Session;
    const event = {
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      created: 1,
      data: { object: checkoutSession },
    } as Stripe.Event;
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
        .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
          handler(tx)
        ),
    };
    const stripeEventRepository = {
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(async (_meta, handler) => {
          await handler();
          return { skipped: false };
        }),
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
    const txWrapper = creditsGateway.addCredits.mock.calls[0][1];
    expect(txWrapper?.unwrap()).toBe(tx);
    expect(stripeEventRepository.withEventProcessingLock).toHaveBeenCalled();
  });

  it('grants lifetime monthly credits for standard checkout sessions', async () => {
    const stripe = createStripeStub();
    const checkoutSession = {
      id: 'cs_one_time',
      mode: 'payment',
      metadata: {
        userId: 'user-1',
        priceId: 'price_lifetime',
      },
      customer: 'cus_123',
      amount_total: 9900,
    } as unknown as Stripe.Checkout.Session;
    const event = {
      id: 'evt_checkout_onetime',
      type: 'checkout.session.completed',
      created: 1,
      data: { object: checkoutSession },
    } as Stripe.Event;
    (stripe.webhooks.constructEvent as any).mockReturnValue(event);
    const tx = { id: 'tx-onetime' };
    const creditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };
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
        .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
          handler(tx)
        ),
    };
    const stripeEventRepository = {
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(async (_meta, handler) => {
          await handler();
          return { skipped: false };
        }),
    };
    const { service } = createService({
      stripe,
      creditsGateway,
      paymentRepository,
      stripeEventRepository,
      notificationGateway,
    });

    await service.handleWebhookEvent('payload', 'signature');

    expect(paymentRepository.findBySessionId).toHaveBeenCalledWith(
      'cs_one_time',
      tx
    );
    expect(creditsGateway.addLifetimeMonthlyCredits).toHaveBeenCalledWith(
      'user-1',
      'price_lifetime',
      expect.anything()
    );
    const lifetimeTx =
      creditsGateway.addLifetimeMonthlyCredits.mock.calls[0][2];
    expect(lifetimeTx?.unwrap()).toBe(tx);
    expect(notificationGateway.notifyPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'cs_one_time', amount: 99 })
    );
  });

  it('handles subscription renewal and awards credits', async () => {
    const stripe = createStripeStub();
    const event = {
      id: 'evt_123',
      type: 'customer.subscription.updated',
      created: 1,
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_456',
          status: 'active',
          cancel_at_period_end: false,
          metadata: { userId: 'user-1' },
          items: {
            data: [
              {
                price: {
                  id: 'price_123',
                  recurring: { interval: 'month' },
                },
                current_period_start: 1,
                current_period_end: 2,
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event;
    (stripe.webhooks.constructEvent as any).mockReturnValue(event);
    const creditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };
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
        .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
          handler(tx)
        ),
    };
    const stripeEventRepository = {
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(async (_meta, handler) => {
          await handler();
          return { skipped: false };
        }),
    };
    const { service } = createService({
      stripe,
      creditsGateway,
      paymentRepository,
      stripeEventRepository,
    });

    await service.handleWebhookEvent('payload', 'signature');

    const subTxWrapper =
      creditsGateway.addSubscriptionCredits.mock.calls[0][2];
    expect(subTxWrapper?.unwrap()).toBe(tx);
    expect(paymentRepository.withTransaction).toHaveBeenCalled();
    expect(stripeEventRepository.withEventProcessingLock).toHaveBeenCalled();
  });

  it('bubbles failures when subscription credit grant fails', async () => {
    const stripe = createStripeStub();
    const event = {
      id: 'evt_124',
      type: 'customer.subscription.updated',
      created: 1,
      data: {
        object: {
          id: 'sub_456',
          customer: 'cus_789',
          status: 'active',
          cancel_at_period_end: false,
          metadata: { userId: 'user-1' },
          items: {
            data: [
              {
                price: {
                  id: 'price_123',
                  recurring: { interval: 'month' },
                },
                current_period_start: 1,
                current_period_end: 2,
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event;
    (stripe.webhooks.constructEvent as any).mockReturnValue(event);
    const tx = { id: 'tx-sub-fail' };
    const creditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn().mockRejectedValue(new Error('sub grant fail')),
      addLifetimeMonthlyCredits: vi.fn(),
    };
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
        .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
          handler(tx)
        ),
    };
    const stripeEventRepository = {
      withEventProcessingLock: vi
        .fn()
        .mockImplementation(async (_meta, handler) => {
          await handler();
          return { skipped: false };
        }),
    };
    const { service } = createService({
      stripe,
      creditsGateway,
      paymentRepository,
      stripeEventRepository,
    });

    await expect(
      service.handleWebhookEvent('payload', 'signature')
    ).rejects.toThrow('sub grant fail');
    const subTxWrapper =
      creditsGateway.addSubscriptionCredits.mock.calls[0][2];
    expect(subTxWrapper?.unwrap()).toBe(tx);
    expect(paymentRepository.updateBySubscriptionId).toHaveBeenCalled();
    expect(paymentRepository.withTransaction).toHaveBeenCalled();
  });
});
