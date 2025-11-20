import { randomUUID } from 'crypto';
import type { Logger } from 'pino';
import type Stripe from 'stripe';
import { websiteConfig } from '@/config/website';
import { getCreditPackageById } from '@/credits/server';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import { createCreditsTransaction } from '@/credits/services/transaction-context';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import type { PaymentRepository } from '../data-access/payment-repository';
import { PaymentTypes } from '../types';
import type { NotificationGateway } from './gateways/notification-gateway';
import {
  getSubscriptionPeriodBounds,
  mapStripeIntervalToPlanInterval,
  mapSubscriptionStatusToPaymentStatus,
} from './utils/stripe-subscription';

type WebhookDeps = {
  paymentRepository: PaymentRepository;
  creditsGateway: CreditsGateway;
  notificationGateway: NotificationGateway;
  logger: Logger;
};

export async function handleStripeWebhookEvent(
  event: Stripe.Event,
  deps: WebhookDeps
): Promise<void> {
  if (event.type.startsWith('customer.subscription.')) {
    await handleSubscriptionEvent(event, deps);
    return;
  }
  if (event.type === 'checkout.session.completed') {
    await handleCheckoutEvent(event, deps);
  }
}

async function handleSubscriptionEvent(event: Stripe.Event, deps: WebhookDeps) {
  const subscription = event.data.object as Stripe.Subscription;
  switch (event.type) {
    case 'customer.subscription.created':
      await onCreateSubscription(subscription, deps);
      break;
    case 'customer.subscription.updated':
      await onUpdateSubscription(subscription, deps);
      break;
    case 'customer.subscription.deleted':
      await onDeleteSubscription(subscription, deps);
      break;
    default:
      deps.logger.debug(
        { eventType: event.type },
        'Ignored subscription event'
      );
  }
}

async function handleCheckoutEvent(event: Stripe.Event, deps: WebhookDeps) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== 'payment') return;
  if (session.metadata?.type === 'credit_purchase') {
    await onCreditPurchase(session, deps);
  } else {
    await onOnetimePayment(session, deps);
  }
}

async function onCreateSubscription(
  subscription: Stripe.Subscription,
  deps: WebhookDeps
) {
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) return;
  const userId = subscription.metadata.userId;
  if (!userId) return;
  const { periodStart, periodEnd } = getSubscriptionPeriodBounds(subscription);
  const effectivePeriodStart = periodStart ?? new Date();
  await deps.paymentRepository.withTransaction(async (tx) => {
    await deps.paymentRepository.upsertSubscription(
      {
        id: randomUUID(),
        priceId,
        type: PaymentTypes.SUBSCRIPTION,
        userId,
        customerId: subscription.customer as string,
        subscriptionId: subscription.id,
        interval: mapStripeIntervalToPlanInterval(subscription),
        status: mapSubscriptionStatusToPaymentStatus(subscription.status),
        periodStart: effectivePeriodStart,
        periodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialStart: subscription.trial_start
          ? new Date(subscription.trial_start * 1000)
          : null,
        trialEnd: subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      tx
    );
    if (websiteConfig.credits?.enableCredits) {
      await deps.creditsGateway.addSubscriptionCredits(
        userId,
        priceId,
        effectivePeriodStart,
        createCreditsTransaction(tx)
      );
    }
  });
}

async function onUpdateSubscription(
  subscription: Stripe.Subscription,
  deps: WebhookDeps
) {
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) return;
  const { periodStart, periodEnd } = getSubscriptionPeriodBounds(subscription);
  const handled = await deps.paymentRepository.withTransaction(async (tx) => {
    const existing = await deps.paymentRepository.findOneBySubscriptionId(
      subscription.id,
      tx
    );
    const updatedId = await deps.paymentRepository.updateBySubscriptionId(
      subscription.id,
      {
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
        updatedAt: new Date(),
      },
      tx
    );
    if (!updatedId) {
      return false;
    }
    const isRenewal =
      existing?.periodStart &&
      periodStart &&
      existing.periodStart.getTime() !== periodStart.getTime() &&
      subscription.status === 'active';
    if (isRenewal && existing?.userId && websiteConfig.credits?.enableCredits) {
      const effectivePeriodStart =
        periodStart ?? existing.periodStart ?? new Date();
      await deps.creditsGateway.addSubscriptionCredits(
        existing.userId,
        priceId,
        effectivePeriodStart,
        createCreditsTransaction(tx)
      );
    }
    return true;
  });
  if (!handled) {
    await onCreateSubscription(subscription, deps);
  }
}

async function onDeleteSubscription(
  subscription: Stripe.Subscription,
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
  session: Stripe.Checkout.Session,
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
    if (websiteConfig.credits?.enableCredits) {
      await deps.creditsGateway.addLifetimeMonthlyCredits(
        userId,
        priceId,
        now,
        createCreditsTransaction(tx)
      );
    }
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
  session: Stripe.Checkout.Session,
  deps: WebhookDeps
) {
  const userId = session.metadata?.userId;
  const packageId = session.metadata?.packageId;
  const credits = session.metadata?.credits;
  if (!userId || !packageId || !credits) {
    return;
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
