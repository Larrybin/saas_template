import { randomUUID } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { websiteConfig } from '@/config/website';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import { createCreditsTransaction } from '@/credits/services/transaction-context';
import type { BillingRenewalPort } from '@/domain/billing';
import type { Logger } from '@/lib/server/logger';
import type { CreemWebhookEvent } from '@/payment/creem-types';
import type { PaymentEventRepository } from '@/payment/data-access/payment-event-repository';
import { CreemWebhookHandler } from '@/payment/services/creem-webhook-handler';
import type { PaymentRepositoryLike } from '@/payment/services/stripe-deps';

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomUUID: vi.fn(() => 'uuid-1'),
  };
});

const createTestLogger = (): Logger => {
  const logger = {
    child: () => logger,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return logger as unknown as Logger;
};

const originalCreemConfig = websiteConfig.payment.creem;

afterEach(() => {
  if (originalCreemConfig) {
    websiteConfig.payment.creem = originalCreemConfig;
  } else {
    delete websiteConfig.payment.creem;
  }
});

describe('CreemWebhookHandler', () => {
  it('runs eventVerifier before processing and aborts on failure', async () => {
    const paymentRepository: PaymentRepositoryLike = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: vi.fn(),
      upsertSubscription: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      withTransaction: vi.fn(async (handler) => handler({} as never)),
    };

    const eventRepository: PaymentEventRepository = {
      withEventProcessingLock: vi.fn(),
    };

    const billingService: BillingRenewalPort = {
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    };

    const creditsGateway: CreditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };

    const eventVerifier = {
      verify: vi.fn(() => {
        throw new Error('verify-failed');
      }),
    };

    const handler = new CreemWebhookHandler({
      paymentRepository,
      eventRepository,
      billingService,
      creditsGateway,
      logger: createTestLogger(),
      eventVerifier,
    });

    const event: CreemWebhookEvent = {
      id: 'evt_verify',
      eventType: 'checkout.completed',
      created_at: Date.now(),
      object: {
        id: 'chk_verify',
        order: {
          id: 'order_verify',
          customer: 'cust_verify',
          product: 'prod_verify',
          amount: 1000,
          currency: 'USD',
          status: 'paid',
          type: 'one_time',
        },
        product: {
          id: 'prod_verify',
          name: 'Credits',
          price: 1000,
          currency: 'USD',
          billing_type: 'one_time',
        },
        customer: {
          id: 'cust_verify',
          email: 'verify@example.com',
          name: 'Verifier',
        },
        metadata: {
          user_id: 'user_verify',
          product_type: 'credits',
          credits: 5,
        },
        status: 'completed',
      },
    };

    await expect(
      handler.handleWebhookEvent(event, JSON.stringify(event))
    ).rejects.toThrow('verify-failed');

    expect(eventVerifier.verify).toHaveBeenCalledWith(
      event,
      JSON.stringify(event),
      expect.anything()
    );
    expect(eventRepository.withEventProcessingLock).not.toHaveBeenCalled();
  });

  it('processes checkout.completed credits event and is idempotent', async () => {
    const insertedPayments: unknown[] = [];
    const addCreditsMock = vi.fn().mockResolvedValue(undefined);

    const paymentRepository: PaymentRepositoryLike = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: vi.fn(async (record, _db) => {
        insertedPayments.push(record);
        return (record as { id?: string }).id ?? randomUUID();
      }),
      upsertSubscription: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      withTransaction: vi.fn(async (handler) => handler({} as never)),
    };

    const eventRepository: PaymentEventRepository = {
      withEventProcessingLock: vi
        .fn()
        .mockImplementationOnce(async (_providerId, _event, handler) => {
          const result = await handler();
          return { skipped: false, result };
        })
        .mockImplementationOnce(async () => ({ skipped: true as const })),
    };

    const billingService: BillingRenewalPort = {
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    };

    const creditsGateway: CreditsGateway = {
      addCredits: addCreditsMock,
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };

    const logger = createTestLogger();
    const handler = new CreemWebhookHandler({
      paymentRepository,
      eventRepository,
      billingService,
      creditsGateway,
      logger,
    });

    const event: CreemWebhookEvent = {
      id: 'evt_1',
      eventType: 'checkout.completed',
      created_at: Date.now(),
      object: {
        id: 'chk_1',
        order: {
          id: 'order_1',
          customer: 'cust_1',
          product: 'prod_credits',
          amount: 1000,
          currency: 'USD',
          status: 'paid',
          type: 'one_time',
        },
        product: {
          id: 'prod_credits',
          name: 'Credits',
          price: 1000,
          currency: 'USD',
          billing_type: 'one_time',
        },
        customer: {
          id: 'cust_1',
          email: 'user@example.com',
          name: 'User',
        },
        metadata: {
          user_id: 'user_1',
          product_type: 'credits',
          credits: 10,
        },
        status: 'completed',
      },
      mode: 'test',
    };

    const rawPayload = JSON.stringify(event);

    await handler.handleWebhookEvent(event, rawPayload);
    await handler.handleWebhookEvent(event, rawPayload);

    expect(insertedPayments).toHaveLength(1);
    expect(addCreditsMock).toHaveBeenCalledTimes(1);
  });

  it('inserts payment and calls grantLifetimePlan for one-time non-credits checkout with resolvable priceId', async () => {
    const insertedPayments: unknown[] = [];
    const insertMock = vi.fn(async (record: unknown, _db?: unknown) => {
      insertedPayments.push(record);
      return (record as { id?: string }).id ?? randomUUID();
    });

    const paymentRepository: PaymentRepositoryLike = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: insertMock,
      upsertSubscription: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      withTransaction: vi.fn(async (handler) => handler({} as never)),
    };

    const eventRepository: PaymentEventRepository = {
      withEventProcessingLock: vi.fn(async (_providerId, _event, handler) => ({
        skipped: false,
        result: await handler(),
      })),
    };

    const grantLifetimePlanMock = vi.fn().mockResolvedValue(undefined);
    const billingService: BillingRenewalPort = {
      handleRenewal: vi.fn(),
      grantLifetimePlan: grantLifetimePlanMock,
    };

    const creditsGateway: CreditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };

    websiteConfig.payment.creem = {
      ...(websiteConfig.payment.creem ?? {}),
      subscriptionProducts: {
        lifetime: {
          price_lifetime: { productId: 'prod_lifetime' },
        },
      },
      creditProducts: websiteConfig.payment.creem?.creditProducts ?? {},
    };

    const handler = new CreemWebhookHandler({
      paymentRepository,
      eventRepository,
      billingService,
      creditsGateway,
      logger: createTestLogger(),
    });

    const event: CreemWebhookEvent = {
      id: 'evt_lifetime_checkout',
      eventType: 'checkout.completed',
      created_at: Date.now(),
      object: {
        id: 'chk_lifetime',
        order: {
          id: 'order_lifetime',
          customer: 'cust_lifetime',
          product: 'prod_lifetime',
          amount: 10000,
          currency: 'USD',
          status: 'paid',
          type: 'one_time',
        },
        product: {
          id: 'prod_lifetime',
          name: 'Lifetime Plan',
          price: 10000,
          currency: 'USD',
          billing_type: 'one_time',
        },
        customer: {
          id: 'cust_lifetime',
          email: 'user@example.com',
          name: 'User',
        },
        metadata: {
          user_id: 'user_lifetime',
          product_type: 'subscription',
        },
        status: 'completed',
      },
    };

    await handler.handleWebhookEvent(event, JSON.stringify(event));

    expect(insertMock).toHaveBeenCalledTimes(1);
    const [insertArg] = insertMock.mock.calls[0] ?? [];
    expect(insertArg).toMatchObject({
      priceId: 'price_lifetime',
      type: 'one_time',
      userId: 'user_lifetime',
      customerId: 'cust_lifetime',
      status: 'completed',
    });

    expect(grantLifetimePlanMock).toHaveBeenCalledTimes(1);
    const [grantArg] = grantLifetimePlanMock.mock.calls[0] ?? [];
    expect(grantArg).toMatchObject({
      userId: 'user_lifetime',
      priceId: 'price_lifetime',
    });
    expect(grantArg.transaction).toBeInstanceOf(
      createCreditsTransaction({} as never).constructor
    );
  });

  it('skips non-one_time orders without inserting payment or calling grantLifetimePlan', async () => {
    const insertMock = vi.fn();

    const paymentRepository: PaymentRepositoryLike = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: insertMock,
      upsertSubscription: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      withTransaction: vi.fn(async (handler) => handler({} as never)),
    };

    const eventRepository: PaymentEventRepository = {
      withEventProcessingLock: vi.fn(async (_providerId, _event, handler) => ({
        skipped: false,
        result: await handler(),
      })),
    };

    const grantLifetimePlanMock = vi.fn().mockResolvedValue(undefined);
    const billingService: BillingRenewalPort = {
      handleRenewal: vi.fn(),
      grantLifetimePlan: grantLifetimePlanMock,
    };

    const creditsGateway: CreditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };

    const logger = createTestLogger();
    const handler = new CreemWebhookHandler({
      paymentRepository,
      eventRepository,
      billingService,
      creditsGateway,
      logger,
    });

    const event: CreemWebhookEvent = {
      id: 'evt_non_one_time',
      eventType: 'checkout.completed',
      created_at: Date.now(),
      object: {
        id: 'chk_non_one_time',
        order: {
          id: 'order_non_one_time',
          customer: 'cust_non_one_time',
          product: 'prod_lifetime',
          amount: 10000,
          currency: 'USD',
          status: 'paid',
          type: 'recurring',
        },
        product: {
          id: 'prod_lifetime',
          name: 'Lifetime Plan',
          price: 10000,
          currency: 'USD',
          billing_type: 'one_time',
        },
        customer: {
          id: 'cust_non_one_time',
          email: 'user@example.com',
          name: 'User',
        },
        metadata: {
          user_id: 'user_lifetime',
          product_type: 'subscription',
        },
        status: 'completed',
      },
    };

    await handler.handleWebhookEvent(event, JSON.stringify(event));

    expect(insertMock).not.toHaveBeenCalled();
    expect(grantLifetimePlanMock).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      {
        userId: 'user_lifetime',
        productType: 'subscription',
        orderType: 'recurring',
      },
      'checkout.completed event for non-credits non-one_time product, no-op'
    );
  });

  it('warns and skips when internal priceId cannot be resolved for subscription one-time checkout', async () => {
    const insertMock = vi.fn();

    const paymentRepository: PaymentRepositoryLike = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: insertMock,
      upsertSubscription: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      withTransaction: vi.fn(async (handler) => handler({} as never)),
    };

    const eventRepository: PaymentEventRepository = {
      withEventProcessingLock: vi.fn(async (_providerId, _event, handler) => ({
        skipped: false,
        result: await handler(),
      })),
    };

    const grantLifetimePlanMock = vi.fn().mockResolvedValue(undefined);
    const billingService: BillingRenewalPort = {
      handleRenewal: vi.fn(),
      grantLifetimePlan: grantLifetimePlanMock,
    };

    const creditsGateway: CreditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };

    const logger = createTestLogger();
    const handler = new CreemWebhookHandler({
      paymentRepository,
      eventRepository,
      billingService,
      creditsGateway,
      logger,
    });

    const event: CreemWebhookEvent = {
      id: 'evt_missing_internal_price',
      eventType: 'checkout.completed',
      created_at: Date.now(),
      object: {
        id: 'chk_missing_internal_price',
        order: {
          id: 'order_missing_internal_price',
          customer: 'cust_missing_internal_price',
          product: 'prod_unknown',
          amount: 10000,
          currency: 'USD',
          status: 'paid',
          type: 'one_time',
        },
        product: {
          id: 'prod_unknown',
          name: 'Lifetime Plan',
          price: 10000,
          currency: 'USD',
          billing_type: 'one_time',
        },
        customer: {
          id: 'cust_missing_internal_price',
          email: 'user@example.com',
          name: 'User',
        },
        metadata: {
          user_id: 'user_lifetime',
          product_type: 'subscription',
        },
        status: 'completed',
      },
    };

    await handler.handleWebhookEvent(event, JSON.stringify(event));

    expect(insertMock).not.toHaveBeenCalled();
    expect(grantLifetimePlanMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      {
        checkoutId: 'chk_missing_internal_price',
        productId: 'prod_unknown',
      },
      'Missing internal priceId for Creem one-time checkout'
    );
  });

  it('invokes billingService.handleRenewal on subscription.paid', async () => {
    const paymentRepository: PaymentRepositoryLike = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: vi.fn(),
      upsertSubscription: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      withTransaction: vi.fn(async (handler) => handler({} as never)),
    };

    const eventRepository: PaymentEventRepository = {
      withEventProcessingLock: vi.fn(async (_providerId, _event, handler) => ({
        skipped: false,
        result: await handler(),
      })),
    };

    const handleRenewalMock = vi.fn().mockResolvedValue(undefined);
    const billingService: BillingRenewalPort = {
      handleRenewal: handleRenewalMock,
      grantLifetimePlan: vi.fn(),
    };

    const creditsGateway: CreditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };

    websiteConfig.payment.creem = {
      ...(websiteConfig.payment.creem ?? {}),
      subscriptionProducts: {
        pro: {
          price_pro_month: { productId: 'prod_sub' },
        },
      },
      creditProducts: websiteConfig.payment.creem?.creditProducts ?? {},
    };

    const logger = createTestLogger();
    const handler = new CreemWebhookHandler({
      paymentRepository,
      eventRepository,
      billingService,
      creditsGateway,
      logger,
    });

    const event: CreemWebhookEvent = {
      id: 'evt_sub_paid',
      eventType: 'subscription.paid',
      created_at: Date.now(),
      object: {
        id: 'sub_1',
        product: 'prod_sub',
        customer: 'cust_1',
        status: 'active',
        current_period_start_date: new Date().toISOString(),
        current_period_end_date: new Date().toISOString(),
        metadata: {
          user_id: 'user_1',
        },
      },
    };

    await handler.handleWebhookEvent(event, JSON.stringify(event));

    expect(handleRenewalMock).toHaveBeenCalledTimes(1);
    const calls = handleRenewalMock.mock.calls;
    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error('Expected handleRenewal to be called once');
    }
    const callArg = firstCall[0];
    if (!callArg) {
      throw new Error('Expected handleRenewal to be called with a payload');
    }
    expect(callArg.userId).toBe('user_1');
    expect(callArg.priceId).toBe('price_pro_month');
    expect(callArg.transaction).toBeInstanceOf(
      createCreditsTransaction({} as never).constructor
    );
  });

  it('marks subscription as unpaid on subscription.unpaid events', async () => {
    const updateBySubscriptionId = vi.fn();
    const paymentRepository: PaymentRepositoryLike = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: vi.fn(),
      upsertSubscription: vi.fn(),
      updateBySubscriptionId,
      withTransaction: vi.fn(async (handler) => handler({} as never)),
    };

    const eventRepository: PaymentEventRepository = {
      withEventProcessingLock: vi.fn(async (_providerId, _event, handler) => ({
        skipped: false,
        result: await handler(),
      })),
    };

    const billingService: BillingRenewalPort = {
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    };

    const creditsGateway: CreditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };

    websiteConfig.payment.creem = {
      ...(websiteConfig.payment.creem ?? {}),
      subscriptionProducts: {
        pro: {
          price_plan_unpaid: { productId: 'prod_plan_unpaid' },
        },
      },
      creditProducts: websiteConfig.payment.creem?.creditProducts ?? {},
    };

    const handler = new CreemWebhookHandler({
      paymentRepository,
      eventRepository,
      billingService,
      creditsGateway,
      logger: createTestLogger(),
    });

    const event: CreemWebhookEvent = {
      id: 'evt_unpaid',
      eventType: 'subscription.unpaid',
      created_at: Date.now(),
      object: {
        id: 'sub_unpaid',
        product: 'prod_plan_unpaid',
        customer: 'cust_unpaid',
        status: 'unpaid',
        current_period_start_date: new Date().toISOString(),
        current_period_end_date: new Date().toISOString(),
        metadata: {
          user_id: 'user_unpaid',
        },
      },
    };

    await handler.handleWebhookEvent(event, JSON.stringify(event));

    expect(updateBySubscriptionId).toHaveBeenCalledWith(
      'sub_unpaid',
      expect.objectContaining({
        status: 'unpaid',
        priceId: 'price_plan_unpaid',
      }),
      expect.anything()
    );
  });

  it('updates subscription data on subscription.update events', async () => {
    const updateBySubscriptionId = vi.fn();
    const paymentRepository: PaymentRepositoryLike = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: vi.fn(),
      upsertSubscription: vi.fn(),
      updateBySubscriptionId,
      withTransaction: vi.fn(async (handler) => handler({} as never)),
    };

    const eventRepository: PaymentEventRepository = {
      withEventProcessingLock: vi.fn(async (_providerId, _event, handler) => ({
        skipped: false,
        result: await handler(),
      })),
    };

    const billingService: BillingRenewalPort = {
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    };

    const creditsGateway: CreditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };

    websiteConfig.payment.creem = {
      ...(websiteConfig.payment.creem ?? {}),
      subscriptionProducts: {
        pro: {
          price_plan_update: { productId: 'prod_plan_update' },
        },
      },
      creditProducts: websiteConfig.payment.creem?.creditProducts ?? {},
    };

    const handler = new CreemWebhookHandler({
      paymentRepository,
      eventRepository,
      billingService,
      creditsGateway,
      logger: createTestLogger(),
    });

    const event: CreemWebhookEvent = {
      id: 'evt_update',
      eventType: 'subscription.update',
      created_at: Date.now(),
      object: {
        id: 'sub_update',
        product: 'prod_plan_update',
        customer: 'cust_update',
        status: 'active',
        current_period_start_date: new Date().toISOString(),
        current_period_end_date: new Date().toISOString(),
        metadata: {
          user_id: 'user_update',
        },
      },
    };

    await handler.handleWebhookEvent(event, JSON.stringify(event));

    expect(updateBySubscriptionId).toHaveBeenCalledWith(
      'sub_update',
      expect.objectContaining({
        status: 'active',
        priceId: 'price_plan_update',
      }),
      expect.anything()
    );
  });

  it('ignores refund.created events without failing', async () => {
    const paymentRepository: PaymentRepositoryLike = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: vi.fn(),
      upsertSubscription: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      withTransaction: vi.fn(async (handler) => handler({} as never)),
    };

    const eventRepository: PaymentEventRepository = {
      withEventProcessingLock: vi.fn(async (_providerId, _event, handler) => ({
        skipped: false,
        result: await handler(),
      })),
    };

    const billingService: BillingRenewalPort = {
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    };

    const creditsGateway: CreditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };

    const handler = new CreemWebhookHandler({
      paymentRepository,
      eventRepository,
      billingService,
      creditsGateway,
      logger: createTestLogger(),
    });

    const event: CreemWebhookEvent = {
      id: 'evt_refund',
      eventType: 'refund.created',
      created_at: Date.now(),
      object: {},
    };

    await expect(
      handler.handleWebhookEvent(event, JSON.stringify(event))
    ).resolves.toBeUndefined();
    expect(eventRepository.withEventProcessingLock).toHaveBeenCalledTimes(1);
  });
});

describe('CreemWebhookHandler metadata parsing', () => {
  it('processes metadata from subscription when checkout metadata is missing', async () => {
    const paymentRepository: PaymentRepositoryLike = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: vi.fn(),
      upsertSubscription: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      withTransaction: vi.fn(async (handler) => handler({} as never)),
    };

    const eventRepository: PaymentEventRepository = {
      withEventProcessingLock: vi.fn(async (_providerId, _event, handler) => ({
        skipped: false,
        result: await handler(),
      })),
    };

    const billingService: BillingRenewalPort = {
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    };

    const addCreditsMock = vi.fn();
    const creditsGateway: CreditsGateway = {
      addCredits: addCreditsMock,
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };

    const handler = new CreemWebhookHandler({
      paymentRepository,
      eventRepository,
      billingService,
      creditsGateway,
      logger: createTestLogger(),
    });

    const event: CreemWebhookEvent = {
      id: 'evt_subscription_metadata',
      eventType: 'checkout.completed',
      created_at: Date.now(),
      object: {
        id: 'chk_2',
        order: {
          id: 'order_2',
          customer: 'cust_2',
          product: 'prod_credits',
          amount: 1000,
          currency: 'USD',
          status: 'paid',
          type: 'one_time',
        },
        subscription: {
          id: 'sub_1',
          customer: 'cust_2',
          product: 'prod_credits',
          collection_method: 'charge_automatically',
          status: 'active',
          metadata: {
            user_id: 'user_2',
            product_type: 'credits',
            credits: 5,
          },
        },
        product: {
          id: 'prod_credits',
          name: 'Credits',
          price: 1000,
          currency: 'USD',
          billing_type: 'one_time',
        },
        customer: {
          id: 'cust_2',
          email: 'user2@example.com',
          name: 'User2',
        },
        status: 'completed',
      },
    };

    await handler.handleWebhookEvent(event, JSON.stringify(event));

    expect(addCreditsMock).toHaveBeenCalledTimes(1);
    const addCreditsCalls = addCreditsMock.mock.calls;
    const firstAddCreditsCall = addCreditsCalls[0];
    if (!firstAddCreditsCall) {
      throw new Error('Expected addCredits to be called once');
    }
    const addCreditsArg = firstAddCreditsCall[0];
    if (!addCreditsArg) {
      throw new Error('Expected addCredits to be called with a payload');
    }
    expect(addCreditsArg.userId).toBe('user_2');
  });

  it('warns and skips when metadata is missing', async () => {
    const paymentRepository: PaymentRepositoryLike = {
      listByUser: vi.fn(),
      findOneBySubscriptionId: vi.fn(),
      findBySessionId: vi.fn(),
      insert: vi.fn(),
      upsertSubscription: vi.fn(),
      updateBySubscriptionId: vi.fn(),
      withTransaction: vi.fn(async (handler) => handler({} as never)),
    };

    const eventRepository: PaymentEventRepository = {
      withEventProcessingLock: vi.fn(async (_providerId, _event, handler) => ({
        skipped: false,
        result: await handler(),
      })),
    };

    const billingService: BillingRenewalPort = {
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    };

    const creditsGateway: CreditsGateway = {
      addCredits: vi.fn(),
      addSubscriptionCredits: vi.fn(),
      addLifetimeMonthlyCredits: vi.fn(),
    };

    const logger = createTestLogger();
    const handler = new CreemWebhookHandler({
      paymentRepository,
      eventRepository,
      billingService,
      creditsGateway,
      logger,
    });

    const event: CreemWebhookEvent = {
      id: 'evt_missing_metadata',
      eventType: 'checkout.completed',
      created_at: Date.now(),
      object: {
        id: 'chk_missing',
        order: {
          id: 'order_missing',
          customer: 'cust_missing',
          product: 'prod_missing',
          amount: 1000,
          currency: 'USD',
          status: 'paid',
          type: 'one_time',
        },
        product: {
          id: 'prod_missing',
          name: 'Credits',
          price: 1000,
          currency: 'USD',
          billing_type: 'one_time',
        },
        customer: {
          id: 'cust_missing',
          email: 'missing@example.com',
          name: 'Missing',
        },
        status: 'completed',
      },
    };

    await handler.handleWebhookEvent(event, JSON.stringify(event));

    expect(paymentRepository.insert).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      {
        checkoutId: 'chk_missing',
        subscriptionId: undefined,
      },
      'Missing metadata in Creem checkout payload'
    );
  });
});
