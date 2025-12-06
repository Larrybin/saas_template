import { randomUUID } from 'crypto';
import { websiteConfig } from '@/config/website';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import { createCreditsTransaction } from '@/credits/services/transaction-context';
import type { BillingRenewalPort } from '@/domain/billing';
import type { Logger } from '@/lib/server/logger';
import type {
  CreemCheckout,
  CreemSubscription,
  CreemWebhookEvent,
} from '../creem-types';
import type { PaymentEventRepository } from '../data-access/payment-event-repository';
import { type PaymentStatus, PaymentTypes } from '../types';
import {
  getMetadataFromCreemCheckout,
  toCreemMetadataPayload,
} from './creem-payment-adapter';
import type { PaymentRepositoryLike } from './stripe-deps';

export type CreemWebhookEventVerifier = {
  verify: (
    event: CreemWebhookEvent,
    rawPayload: string,
    logger: Logger
  ) => Promise<void> | void;
};

export type CreemWebhookHandlerDeps = {
  paymentRepository: PaymentRepositoryLike;
  eventRepository: PaymentEventRepository;
  billingService: BillingRenewalPort;
  creditsGateway: CreditsGateway;
  logger: Logger;
  eventVerifier?: CreemWebhookEventVerifier;
};

type InternalCreemSubscription = {
  userId?: string;
  priceId?: string;
  customerId?: string;
  subscriptionId: string;
  periodStart?: Date;
  periodEnd?: Date;
  status: PaymentStatus;
};

export class CreemWebhookHandler {
  private readonly paymentRepository: PaymentRepositoryLike;
  private readonly eventRepository: PaymentEventRepository;
  private readonly billingService: BillingRenewalPort;
  private readonly creditsGateway: CreditsGateway;
  private readonly logger: Logger;
  private readonly eventVerifier: CreemWebhookEventVerifier | undefined;

  constructor(deps: CreemWebhookHandlerDeps) {
    this.paymentRepository = deps.paymentRepository;
    this.eventRepository = deps.eventRepository;
    this.billingService = deps.billingService;
    this.creditsGateway = deps.creditsGateway;
    this.logger = deps.logger;
    this.eventVerifier = deps.eventVerifier;
  }

  async handleWebhookEvent(
    event: CreemWebhookEvent,
    rawPayload: string
  ): Promise<void> {
    const log = this.logger.child({
      span: 'creem.webhook.handleEvent',
      eventId: event.id,
      eventType: event.eventType,
    });

    if (this.eventVerifier) {
      await this.eventVerifier.verify(event, rawPayload, log);
    }

    const processing = await this.eventRepository.withEventProcessingLock(
      'creem',
      {
        eventId: event.id,
        type: event.eventType,
        createdAt: new Date(event.created_at),
        payload: rawPayload,
      },
      async () => {
        await this.dispatchEvent(event, log);
      }
    );

    if (processing.skipped) {
      log.info('Skipping already processed Creem event');
    }
  }

  private async dispatchEvent(
    event: CreemWebhookEvent,
    log: Logger
  ): Promise<void> {
    switch (event.eventType) {
      case 'checkout.completed':
        return this.handleCheckoutCompleted(event, log);
      case 'subscription.paid':
        return this.handleSubscriptionPaid(event, log);
      case 'subscription.active':
      case 'subscription.trialing':
      case 'subscription.expired':
      case 'subscription.canceled':
      case 'subscription.unpaid':
      case 'subscription.update':
        return this.handleSubscriptionLifecycle(event, log);
      case 'refund.created':
        return this.handleRefundCreated(event, log);
      default:
        log.info(
          { eventType: event.eventType },
          'Ignoring unsupported Creem event'
        );
    }
  }

  private async handleCheckoutCompleted(
    event: CreemWebhookEvent,
    log: Logger
  ): Promise<void> {
    const checkout = event.object as CreemCheckout;
    if (!checkout || !checkout.order) {
      log.warn('checkout.completed event without order payload');
      return;
    }

    if (checkout.status !== 'completed' || checkout.order.status !== 'paid') {
      log.info(
        {
          checkoutId: checkout.id,
          checkoutStatus: checkout.status,
          orderStatus: checkout.order.status,
        },
        'Skipping Creem checkout.completed without paid order'
      );
      return;
    }

    const metadata = getMetadataFromCreemCheckout(checkout);
    if (!metadata) {
      log.warn(
        {
          checkoutId: checkout.id,
          subscriptionId:
            typeof checkout.subscription === 'string'
              ? checkout.subscription
              : checkout.subscription?.id,
        },
        'Missing metadata in Creem checkout payload'
      );
      return;
    }
    const { userId, productType, credits } = metadata;

    const customerId =
      typeof checkout.customer === 'string'
        ? checkout.customer
        : checkout.customer.id;

    if (productType === 'credits') {
      await this.paymentRepository.withTransaction(async (tx) => {
        const now = new Date();
        const priceId =
          typeof checkout.product === 'string'
            ? checkout.product
            : checkout.product.id;

        const paymentId = await this.paymentRepository.insert(
          {
            id: randomUUID(),
            priceId,
            type: PaymentTypes.ONE_TIME,
            userId,
            customerId,
            sessionId: undefined,
            subscriptionId: undefined,
            status: 'completed',
            periodStart: now,
            periodEnd: undefined,
            cancelAtPeriodEnd: undefined,
            trialStart: undefined,
            trialEnd: undefined,
            createdAt: now,
            updatedAt: now,
          },
          tx
        );

        const amount =
          typeof credits === 'number' && credits > 0 ? credits : undefined;

        if (amount) {
          await this.creditsGateway.addCredits(
            {
              userId,
              amount,
              type: toCreemMetadataPayload(metadata).product_type,
              description: 'Creem credits purchase',
              ...(paymentId ? { paymentId } : {}),
            },
            createCreditsTransaction(tx)
          );
        }
      });

      log.info(
        { userId, productType, credits },
        'Processed Creem credits checkout'
      );
      return;
    }

    if (productType !== 'subscription') {
      log.warn(
        { userId, productType },
        'Unsupported productType in Creem checkout payload'
      );
      return;
    }

    if (checkout.order.type !== 'one_time') {
      log.info(
        {
          userId,
          productType,
          orderType: checkout.order.type,
        },
        'checkout.completed event for non-credits non-one_time product, no-op'
      );
      return;
    }

    const rawMetadata =
      (checkout.subscription &&
        typeof checkout.subscription !== 'string' &&
        checkout.subscription.metadata) ??
      checkout.metadata ??
      {};

    const internalPriceId = resolveInternalPriceIdFromCheckout(
      checkout,
      rawMetadata as Record<string, unknown>
    );

    if (!internalPriceId) {
      log.warn(
        {
          checkoutId: checkout.id,
          productId:
            typeof checkout.product === 'string'
              ? checkout.product
              : checkout.product.id,
        },
        'Missing internal priceId for Creem one-time checkout'
      );
      return;
    }

    await this.paymentRepository.withTransaction(async (tx) => {
      const now = new Date();

      await this.paymentRepository.insert(
        {
          id: randomUUID(),
          priceId: internalPriceId,
          type: PaymentTypes.ONE_TIME,
          userId,
          customerId,
          sessionId: undefined,
          subscriptionId: undefined,
          status: 'completed',
          periodStart: now,
          periodEnd: undefined,
          cancelAtPeriodEnd: undefined,
          trialStart: undefined,
          trialEnd: undefined,
          createdAt: now,
          updatedAt: now,
        },
        tx
      );

      await this.billingService.grantLifetimePlan({
        userId,
        priceId: internalPriceId,
        cycleRefDate: now,
        transaction: createCreditsTransaction(tx),
      });
    });

    log.info(
      { userId, productType, priceId: internalPriceId },
      'Processed Creem one-time plan checkout'
    );
  }

  private async handleSubscriptionPaid(
    event: CreemWebhookEvent,
    log: Logger
  ): Promise<void> {
    const subscription = event.object as CreemSubscription;
    if (!subscription) {
      log.warn('subscription.paid event without subscription payload');
      return;
    }

    const internal = mapCreemSubscriptionToInternal(
      subscription,
      event.eventType
    );
    const {
      userId,
      priceId,
      customerId,
      subscriptionId,
      periodStart,
      periodEnd,
      status,
    } = internal;

    if (!userId || !priceId) {
      log.warn('Missing userId or priceId in Creem subscription');
      return;
    }

    const effectiveStart = periodStart ?? new Date();

    await this.paymentRepository.withTransaction(async (tx) => {
      await this.paymentRepository.upsertSubscription(
        {
          id: randomUUID(),
          priceId,
          type: PaymentTypes.SUBSCRIPTION,
          userId,
          customerId: customerId ?? '',
          subscriptionId,
          interval: undefined,
          status,
          periodStart: effectiveStart,
          periodEnd,
          cancelAtPeriodEnd: status === 'canceled',
          trialStart: undefined,
          trialEnd: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        tx
      );

      await this.billingService.handleRenewal({
        userId,
        priceId,
        cycleRefDate: effectiveStart,
        transaction: createCreditsTransaction(tx),
      });
    });

    log.info({ userId, priceId }, 'Processed Creem subscription.paid');
  }

  private async handleSubscriptionLifecycle(
    event: CreemWebhookEvent,
    log: Logger
  ): Promise<void> {
    const subscription = event.object as CreemSubscription;
    if (!subscription) {
      log.warn('Subscription lifecycle event without subscription payload');
      return;
    }

    const internal = mapCreemSubscriptionToInternal(
      subscription,
      event.eventType
    );
    const { subscriptionId, priceId, periodStart, periodEnd, status } =
      internal;

    if (!priceId) {
      log.warn('Missing priceId in Creem subscription lifecycle event');
      return;
    }

    await this.paymentRepository.withTransaction(async (tx) => {
      await this.paymentRepository.updateBySubscriptionId(
        subscriptionId,
        {
          priceId,
          status,
          periodStart,
          periodEnd,
          cancelAtPeriodEnd: status === 'canceled',
        },
        tx
      );
    });

    log.info(
      {
        subscriptionId,
        priceId,
        status,
        eventType: event.eventType,
      },
      'Synced Creem subscription lifecycle event'
    );
  }

  private async handleRefundCreated(
    event: CreemWebhookEvent,
    log: Logger
  ): Promise<void> {
    log.info(
      { eventId: event.id, eventType: event.eventType },
      'Creem refund event received; no-op for current integration scope'
    );
  }
}

const resolveInternalPriceIdFromProductId = (
  creemProductId: string | undefined,
  metadata: Record<string, unknown>
): string | undefined => {
  const priceIdFromMetadata =
    (metadata.price_id as string | undefined) ??
    (metadata.priceId as string | undefined);

  if (priceIdFromMetadata) {
    return priceIdFromMetadata;
  }

  const subscriptionProducts =
    websiteConfig.payment.creem?.subscriptionProducts;

  if (!creemProductId || !subscriptionProducts) {
    return undefined;
  }

  for (const planProducts of Object.values(subscriptionProducts)) {
    for (const [internalPriceId, creemProduct] of Object.entries(
      planProducts
    )) {
      if (
        creemProduct.productId === creemProductId ||
        creemProduct.priceId === creemProductId
      ) {
        return internalPriceId;
      }
    }
  }

  return undefined;
};

const resolveInternalPriceIdFromCheckout = (
  checkout: CreemCheckout,
  metadata: Record<string, unknown>
): string | undefined => {
  const creemProductId =
    typeof checkout.product === 'string'
      ? checkout.product
      : checkout.product.id;

  return resolveInternalPriceIdFromProductId(creemProductId, metadata);
};

const resolveInternalPriceIdFromSubscription = (
  subscription: CreemSubscription,
  metadata: Record<string, unknown>
): string | undefined => {
  const creemProductId =
    typeof subscription.product === 'string'
      ? subscription.product
      : subscription.product.id;
  return resolveInternalPriceIdFromProductId(creemProductId, metadata);
};

const mapCreemSubscriptionToInternal = (
  subscription: CreemSubscription,
  eventType: string
): InternalCreemSubscription => {
  const metadata = subscription.metadata ?? {};
  const priceId = resolveInternalPriceIdFromSubscription(
    subscription,
    metadata
  );
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;
  const rawUserId =
    (metadata.user_id as string | undefined) ??
    (metadata.userId as string | undefined);

  const periodStart = subscription.current_period_start_date
    ? new Date(subscription.current_period_start_date)
    : undefined;
  const periodEnd = subscription.current_period_end_date
    ? new Date(subscription.current_period_end_date)
    : undefined;

  const status = mapCreemSubscriptionStatusToPaymentStatus(
    subscription.status,
    eventType
  );

  return {
    ...(rawUserId ? { userId: rawUserId } : {}),
    ...(priceId ? { priceId } : {}),
    customerId,
    subscriptionId: subscription.id,
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd } : {}),
    status,
  };
};

const mapCreemSubscriptionStatusToPaymentStatus = (
  status: CreemSubscription['status'],
  eventType: string
): PaymentStatus => {
  if (eventType === 'subscription.trialing') {
    return 'trialing';
  }

  if (eventType === 'subscription.unpaid') {
    return 'unpaid';
  }

  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'canceled':
      return 'canceled';
    case 'expired':
      return 'past_due';
    case 'past_due':
      return 'past_due';
    case 'unpaid':
      return 'unpaid';
    case 'incomplete':
      return 'incomplete';
    case 'incomplete_expired':
      return 'incomplete_expired';
    default:
      return 'active';
  }
};
