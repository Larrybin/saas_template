import { randomUUID } from 'crypto';
import type { Logger } from 'pino';
import { InvalidCreditPayloadError } from '@/credits/domain/errors';
import { getCreditPackageById } from '@/credits/server';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import { createCreditsTransaction } from '@/credits/services/transaction-context';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import type { BillingRenewalPort } from '@/domain/billing';
import { processSubscriptionRenewalWithCredits } from '@/lib/server/usecases/process-subscription-renewal-with-credits';
import { PaymentTypes } from '../types';
import type { NotificationGateway } from './gateways/notification-gateway';
import type {
  PaymentRepositoryLike,
  StripeCheckoutCompletedEventLike,
  StripeCheckoutSessionLike,
  StripeSubscriptionEventLike,
  StripeSubscriptionLike,
  StripeWebhookEventLike,
} from './stripe-deps';
import {
  getSubscriptionPeriodBounds,
  mapStripeIntervalToPlanInterval,
  mapSubscriptionStatusToPaymentStatus,
} from './utils/stripe-subscription';

type WebhookDeps = {
  paymentRepository: PaymentRepositoryLike;
  creditsGateway: CreditsGateway;
  notificationGateway: NotificationGateway;
  logger: Logger;
  billingService: BillingRenewalPort;
};

export async function handleStripeWebhookEvent(
  event: StripeWebhookEventLike,
  deps: WebhookDeps
): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
      await onCreateSubscription(
        (event as StripeSubscriptionEventLike).data.object,
        deps
      );
      break;
    case 'customer.subscription.updated':
      await onUpdateSubscription(
        (event as StripeSubscriptionEventLike).data.object,
        deps
      );
      break;
    case 'customer.subscription.deleted':
      await onDeleteSubscription(
        (event as StripeSubscriptionEventLike).data.object,
        deps
      );
      break;
    case 'checkout.session.completed':
      await handleCheckoutEvent(
        event as StripeCheckoutCompletedEventLike,
        deps
      );
      break;
    default:
      deps.logger.debug({ eventType: event.type }, 'Ignored Stripe event');
  }
}

async function handleCheckoutEvent(
  event: StripeCheckoutCompletedEventLike,
  deps: WebhookDeps
) {
  const session = event.data.object as StripeCheckoutSessionLike;
  if (session.mode !== 'payment') return;
  if (session.metadata?.type === 'credit_purchase') {
    await onCreditPurchase(session, deps);
  } else {
    await onOnetimePayment(session, deps);
  }
}

async function onCreateSubscription(
  subscription: StripeSubscriptionLike,
  deps: WebhookDeps
) {
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) return;
  const userId = subscription.metadata.userId;
  if (!userId) return;
  const { periodStart, periodEnd } = getSubscriptionPeriodBounds(subscription);
  await processSubscriptionRenewalWithCredits(
    {
      eventType: 'created',
      subscription: {
        id: subscription.id,
        customerId: subscription.customer as string,
        userId,
        priceId,
        interval: mapStripeIntervalToPlanInterval(subscription),
        status: mapSubscriptionStatusToPaymentStatus(subscription.status),
        periodStart,
        periodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialStart: subscription.trial_start
          ? new Date(subscription.trial_start * 1000)
          : null,
        trialEnd: subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null,
      },
    },
    {
      paymentRepository: deps.paymentRepository,
      billingService: deps.billingService,
    }
  );
}

async function onUpdateSubscription(
  subscription: StripeSubscriptionLike,
  deps: WebhookDeps
) {
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) return;
  const { periodStart, periodEnd } = getSubscriptionPeriodBounds(subscription);
  await processSubscriptionRenewalWithCredits(
    {
      eventType: 'updated',
      subscription: {
        id: subscription.id,
        customerId: subscription.customer as string,
        userId: subscription.metadata.userId ?? '',
        priceId,
        interval: mapStripeIntervalToPlanInterval(subscription),
        status: mapSubscriptionStatusToPaymentStatus(subscription.status),
        periodStart,
        periodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialStart: subscription.trial_start
          ? new Date(subscription.trial_start * 1000)
          : null,
        trialEnd: subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null,
      },
    },
    {
      paymentRepository: deps.paymentRepository,
      billingService: deps.billingService,
    }
  );
}

async function onDeleteSubscription(
  subscription: StripeSubscriptionLike,
  deps: WebhookDeps
) {
  await deps.paymentRepository.withTransaction(async (tx) => {
    await deps.paymentRepository.updateBySubscriptionId(
      subscription.id,
      {
        status: mapSubscriptionStatusToPaymentStatus(subscription.status),
        updatedAt: new Date(),
      },
      tx
    );
  });
}

async function onOnetimePayment(
  session: StripeCheckoutSessionLike,
  deps: WebhookDeps
) {
  const customerId = session.customer as string;
  const userId = session.metadata?.userId;
  const priceId = session.metadata?.priceId;
  if (!userId || !priceId) return;
  const processed = await deps.paymentRepository.withTransaction(async (tx) => {
    const existing = await deps.paymentRepository.findBySessionId(
      session.id,
      tx
    );
    if (existing) {
      return false;
    }
    const now = new Date();
    await deps.paymentRepository.insert(
      {
        id: randomUUID(),
        priceId,
        type: PaymentTypes.ONE_TIME,
        userId,
        customerId,
        sessionId: session.id,
        status: 'completed',
        periodStart: now,
        createdAt: now,
        updatedAt: now,
      },
      tx
    );
    await deps.billingService.grantLifetimePlan({
      userId,
      priceId,
      cycleRefDate: now,
      transaction: createCreditsTransaction(tx),
    });
    return true;
  });
  if (!processed) {
    return;
  }
  const amount = session.amount_total ? session.amount_total / 100 : 0;
  await deps.notificationGateway.notifyPurchase({
    sessionId: session.id,
    customerId,
    userName: userId,
    amount,
  });
}

async function onCreditPurchase(
  session: StripeCheckoutSessionLike,
  deps: WebhookDeps
) {
  const userId = session.metadata?.userId;
  const packageId = session.metadata?.packageId;
  const credits = session.metadata?.credits;
  if (!userId || !packageId || !credits) {
    deps.logger.error(
      {
        sessionId: session.id,
        metadata: session.metadata,
      },
      'Credit purchase webhook missing metadata'
    );
    throw new InvalidCreditPayloadError(
      'Credit purchase metadata is missing required fields'
    );
  }
  const creditPackage = getCreditPackageById(packageId);
  if (!creditPackage) {
    deps.logger.warn({ packageId }, 'Credit package not found for purchase');
    return;
  }
  await deps.paymentRepository.withTransaction(async (tx) => {
    const existing = await deps.paymentRepository.findBySessionId(
      session.id,
      tx
    );
    if (existing) {
      return;
    }
    const now = new Date();
    await deps.paymentRepository.insert(
      {
        id: randomUUID(),
        priceId: session.metadata?.priceId || '',
        type: PaymentTypes.ONE_TIME,
        userId,
        customerId: session.customer as string,
        sessionId: session.id,
        status: 'completed',
        periodStart: now,
        createdAt: now,
        updatedAt: now,
      },
      tx
    );
    await deps.creditsGateway.addCredits(
      {
        userId,
        amount: Number.parseInt(credits, 10),
        type: CREDIT_TRANSACTION_TYPE.PURCHASE_PACKAGE,
        description: `+${credits} credits for package ${packageId}`,
        paymentId: session.id,
        ...(creditPackage.expireDays !== undefined
          ? { expireDays: creditPackage.expireDays }
          : {}),
      },
      createCreditsTransaction(tx)
    );
  });
}
