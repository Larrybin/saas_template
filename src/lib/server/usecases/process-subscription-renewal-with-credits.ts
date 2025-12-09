import 'server-only';

import { randomUUID } from 'node:crypto';
import { createCreditsTransaction } from '@/credits/services/transaction-context';
import type { BillingRenewalPort } from '@/domain/billing';
import { getLogger } from '@/lib/server/logger';
import type { PaymentRepositoryLike } from '@/payment/services/stripe-deps';
import {
  type PaymentStatus,
  PaymentTypes,
  type PlanInterval,
} from '@/payment/types';

export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  userId: string;
  priceId: string;
  interval: PlanInterval | null;
  status: PaymentStatus;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialStart: Date | null;
  trialEnd: Date | null;
};

export type ProcessSubscriptionRenewalWithCreditsInput = {
  /**
   * Webhook 事件类型，用于区分首次创建与后续更新。
   *
   * - "created"：customer.subscription.created
   * - "updated"：customer.subscription.updated
   */
  eventType: 'created' | 'updated';
  subscription: SubscriptionSnapshot;
};

export type ProcessSubscriptionRenewalWithCreditsDeps = {
  paymentRepository: PaymentRepositoryLike;
  billingService: BillingRenewalPort;
};

/**
 * Usecase: 将订阅续费事件收口为「Payment 账本记录 + Credits 发放」的单一编排点。
 *
 * 责任：
 * - 在 Payment 表中创建或更新 subscription 记录；
 * - 根据事件类型和周期边界，决定是否调用 Billing 领域的 handleRenewal；
 * - 在同一事务中将 Credits 发放绑定到 Payment 记录（通过 CreditsTransaction）。
 *
 * 约束：
 * - 不感知 Stripe 具体事件结构，只消费 SubscriptionSnapshot；
 * - 不做多 Provider / 多租户抽象，保持与当前使用场景一致。
 */
export async function processSubscriptionRenewalWithCredits(
  input: ProcessSubscriptionRenewalWithCreditsInput,
  deps: ProcessSubscriptionRenewalWithCreditsDeps
): Promise<void> {
  const { subscription, eventType } = input;

  const logger = getLogger({
    span: 'usecase.subscription-renewal-with-credits',
    userId: subscription.userId,
  });

  await deps.paymentRepository.withTransaction(async (tx) => {
    const now = new Date();

    const effectivePeriodStart =
      subscription.periodStart ?? subscription.periodEnd ?? now;

    if (eventType === 'created') {
      await deps.paymentRepository.upsertSubscription(
        {
          id: randomUUID(),
          priceId: subscription.priceId,
          type: PaymentTypes.SUBSCRIPTION,
          userId: subscription.userId,
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          interval: subscription.interval,
          status: subscription.status,
          periodStart: effectivePeriodStart,
          periodEnd: subscription.periodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          trialStart: subscription.trialStart,
          trialEnd: subscription.trialEnd,
          createdAt: now,
          updatedAt: now,
        },
        tx
      );

      logger.info(
        { userId: subscription.userId, priceId: subscription.priceId },
        'Recorded subscription creation and granting renewal credits'
      );

      await deps.billingService.handleRenewal({
        userId: subscription.userId,
        priceId: subscription.priceId,
        cycleRefDate: effectivePeriodStart,
        transaction: createCreditsTransaction(tx),
      });

      return;
    }

    const existing = await deps.paymentRepository.findOneBySubscriptionId(
      subscription.id,
      tx
    );

    const updatedId = await deps.paymentRepository.updateBySubscriptionId(
      subscription.id,
      {
        priceId: subscription.priceId,
        interval: subscription.interval,
        status: subscription.status,
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        trialStart: subscription.trialStart,
        trialEnd: subscription.trialEnd,
        updatedAt: now,
      },
      tx
    );

    if (!updatedId) {
      await deps.paymentRepository.upsertSubscription(
        {
          id: randomUUID(),
          priceId: subscription.priceId,
          type: PaymentTypes.SUBSCRIPTION,
          userId: subscription.userId,
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          interval: subscription.interval,
          status: subscription.status,
          periodStart: effectivePeriodStart,
          periodEnd: subscription.periodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          trialStart: subscription.trialStart,
          trialEnd: subscription.trialEnd,
          createdAt: now,
          updatedAt: now,
        },
        tx
      );

      logger.info(
        {
          userId: subscription.userId,
          priceId: subscription.priceId,
        },
        'Backfilled missing subscription record and granted renewal credits'
      );

      await deps.billingService.handleRenewal({
        userId: subscription.userId,
        priceId: subscription.priceId,
        cycleRefDate: effectivePeriodStart,
        transaction: createCreditsTransaction(tx),
      });

      return;
    }

    const previousPeriodStart = existing?.periodStart ?? null;
    const nextPeriodStart = subscription.periodStart;

    const isRenewal =
      previousPeriodStart !== null &&
      nextPeriodStart !== null &&
      previousPeriodStart.getTime() !== nextPeriodStart.getTime() &&
      subscription.status === 'active';

    if (!isRenewal || !existing?.userId) {
      logger.debug(
        {
          subscriptionId: subscription.id,
          previousPeriodStart,
          nextPeriodStart,
          status: subscription.status,
        },
        'Subscription update does not represent a renewal, skipping credits grant'
      );
      return;
    }

    const renewalRefDate = nextPeriodStart ?? previousPeriodStart ?? now;

    logger.info(
      {
        userId: existing.userId,
        priceId: subscription.priceId,
      },
      'Detected subscription renewal, granting renewal credits'
    );

    await deps.billingService.handleRenewal({
      userId: existing.userId,
      priceId: subscription.priceId,
      cycleRefDate: renewalRefDate,
      transaction: createCreditsTransaction(tx),
    });
  });
}
