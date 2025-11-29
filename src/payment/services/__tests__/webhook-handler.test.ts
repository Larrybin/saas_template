import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import type { BillingRenewalPort } from '@/domain/billing';
import { PaymentTypes } from '../../types';
import type { NotificationGateway } from '../gateways/notification-gateway';
import type {
  PaymentRepositoryLike,
  StripeCheckoutCompletedEventLike,
  StripeWebhookEventLike,
} from '../stripe-deps';
import { handleStripeWebhookEvent } from '../webhook-handler';

vi.mock('@/credits/server', () => ({
  getCreditPackageById: vi.fn(() => ({
    id: 'pkg_basic',
    amount: 25,
    expireDays: 30,
    price: { priceId: 'price_credit' },
  })),
}));

const createDeps = () => {
  const paymentRepository: PaymentRepositoryLike = {
    listByUser: vi.fn(),
    findOneBySubscriptionId: vi.fn(),
    findBySessionId: vi.fn(),
    insert: vi.fn(),
    upsertSubscription: vi.fn(),
    updateBySubscriptionId: vi.fn(),
    withTransaction: vi
      .fn()
      .mockImplementation(async (handler: (tx: unknown) => Promise<unknown>) =>
        handler({})
      ),
  };

  const creditsGateway: CreditsGateway = {
    addCredits: vi.fn(),
    addSubscriptionCredits: vi.fn(),
    addLifetimeMonthlyCredits: vi.fn(),
  } as unknown as CreditsGateway;

  const notificationGateway: NotificationGateway = {
    notifyPurchase: vi.fn(),
  } as unknown as NotificationGateway;

  const billingService: BillingRenewalPort = {
    startSubscriptionCheckout: vi.fn(),
    startCreditCheckout: vi.fn(),
    handleRenewal: vi.fn(),
    grantLifetimePlan: vi.fn(),
  } as unknown as BillingRenewalPort;

  const logger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  return {
    paymentRepository,
    creditsGateway,
    notificationGateway,
    billingService,
    logger,
  };
};

describe('handleStripeWebhookEvent (domain)', () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
    vi.clearAllMocks();
  });

  it('ignores unsupported event types', async () => {
    const event: StripeWebhookEventLike = {
      id: 'evt_ignored',
      type: 'some.unknown.event',
      created: 1,
      data: {
        object: {},
      },
    };

    await handleStripeWebhookEvent(event, deps);

    expect(deps.paymentRepository.withTransaction).not.toHaveBeenCalled();
    expect(deps.logger.debug).toHaveBeenCalledWith(
      { eventType: 'some.unknown.event' },
      'Ignored Stripe event'
    );
  });

  it('handles onetime payment checkout session', async () => {
    const event: StripeCheckoutCompletedEventLike = {
      id: 'evt_checkout_onetime',
      type: 'checkout.session.completed',
      created: 1,
      data: {
        object: {
          id: 'cs_one_time',
          mode: 'payment',
          customer: 'cus_123',
          amount_total: 9900,
          metadata: {
            userId: 'user-1',
            priceId: 'price_lifetime',
          },
        },
      },
    };

    deps.paymentRepository.findBySessionId = vi
      .fn()
      .mockResolvedValue(undefined);

    await handleStripeWebhookEvent(event, deps);

    expect(deps.paymentRepository.withTransaction).toHaveBeenCalledTimes(1);
    expect(deps.paymentRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'price_lifetime',
        type: PaymentTypes.ONE_TIME,
        userId: 'user-1',
        customerId: 'cus_123',
        sessionId: 'cs_one_time',
        status: 'completed',
      }),
      expect.anything()
    );
    expect(deps.billingService.grantLifetimePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        priceId: 'price_lifetime',
        cycleRefDate: expect.any(Date),
        transaction: expect.anything(),
      })
    );
    expect(deps.notificationGateway.notifyPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'cs_one_time',
        customerId: 'cus_123',
        userName: 'user-1',
        amount: 99,
      })
    );
  });

  it('handles credit purchase checkout session', async () => {
    const event: StripeCheckoutCompletedEventLike = {
      id: 'evt_checkout_credit',
      type: 'checkout.session.completed',
      created: 1,
      data: {
        object: {
          id: 'cs_credit',
          mode: 'payment',
          customer: 'cus_123',
          amount_total: 2500,
          metadata: {
            userId: 'user-1',
            packageId: 'pkg_basic',
            credits: '25',
            priceId: 'price_credit',
            type: 'credit_purchase',
          },
        },
      },
    };

    deps.paymentRepository.findBySessionId = vi
      .fn()
      .mockResolvedValue(undefined);

    await handleStripeWebhookEvent(event, deps);

    expect(deps.paymentRepository.withTransaction).toHaveBeenCalledTimes(1);
    expect(deps.paymentRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'price_credit',
        type: PaymentTypes.ONE_TIME,
        userId: 'user-1',
        customerId: 'cus_123',
        sessionId: 'cs_credit',
        status: 'completed',
      }),
      expect.anything()
    );
    expect(deps.creditsGateway.addCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 25,
        paymentId: 'cs_credit',
      }),
      expect.anything()
    );
  });
});
