import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { featureFlags } from '@/config/feature-flags';
import { getDb } from '@/db';
import { payment, user } from '@/db/schema';
import { findPlanByPriceId, getAllPricePlans } from '@/lib/price-plan';
import { getLogger } from '@/lib/server/logger';
import { PlanIntervals } from '@/payment/types';
import {
  CreditDistributionService,
  type PlanUserRecord,
} from './distribution/credit-distribution-service';
import { runExpirationJob } from './expiry-job';
import { getPeriodKey } from './utils/period-key';

/**
 * Distribute credits to all users based on their plan type
 * This function is designed to be called by a cron job
 */
const baseLogger = getLogger({ span: 'credits.distribute' });
const creditDistributionService = new CreditDistributionService();

type UserWithPayment = {
  userId: string;
  email: string | null;
  name: string | null;
  priceId: string | null;
  paymentStatus: string | null;
  paymentCreatedAt: Date | null;
};

export async function distributeCreditsToAllUsers(options?: {
  refDate?: Date;
}) {
  const log = baseLogger.child({ span: 'distributeCreditsToAllUsers' });
  log.info('Starting credit distribution job');

  // Process expired credits first before distributing new credits
  log.debug('Processing expired credits before distribution');
  const expiredResult = await runExpirationJob();
  log.debug({ expiredResult }, 'Finished processing expired credits');

  const db = await getDb();
  const latestPaymentQuery = db
    .select({
      userId: payment.userId,
      priceId: payment.priceId,
      status: payment.status,
      createdAt: payment.createdAt,
      rowNumber:
        sql<number>`ROW_NUMBER() OVER (PARTITION BY ${payment.userId} ORDER BY ${payment.createdAt} DESC)`.as(
          'row_number'
        ),
    })
    .from(payment)
    .where(or(eq(payment.status, 'active'), eq(payment.status, 'trialing')))
    .as('latest_payment');

  const now = options?.refDate ?? new Date();
  const monthLabel = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const periodKey = getPeriodKey(now);
  const freePlan = getAllPricePlans().find(
    (plan) =>
      plan.isFree && plan.credits?.enable && (plan.credits.amount ?? 0) > 0
  );

  let processedCount = 0;
  let errorCount = 0;
  let usersCount = 0;
  let lastProcessedUserId: string | null = null;

  const userBatchSize = 1000;
  const batchSize = 100;

  if (!freePlan) {
    log.info('Free plan credits disabled, skipping free users');
  }

  const fetchUsersBatch = async (
    lastUserId: string | null,
    limit: number
  ): Promise<UserWithPayment[]> => {
    const baseCondition = or(isNull(user.banned), eq(user.banned, false));
    const paginationCondition = lastUserId
      ? and(baseCondition, gt(user.id, lastUserId))
      : baseCondition;

    return await db
      .select({
        userId: user.id,
        email: user.email,
        name: user.name,
        priceId: latestPaymentQuery.priceId,
        paymentStatus: latestPaymentQuery.status,
        paymentCreatedAt: latestPaymentQuery.createdAt,
      })
      .from(user)
      .leftJoin(
        latestPaymentQuery,
        and(
          eq(user.id, latestPaymentQuery.userId),
          eq(latestPaymentQuery.rowNumber, 1)
        )
      )
      .where(paginationCondition)
      .orderBy(user.id)
      .limit(limit);
  };

  do {
    const userBatch = await fetchUsersBatch(lastProcessedUserId, userBatchSize);
    if (userBatch.length === 0) {
      break;
    }

    usersCount += userBatch.length;

    const freeUserIds: string[] = [];
    const lifetimeUsers: PlanUserRecord[] = [];
    const yearlyUsers: PlanUserRecord[] = [];

    userBatch.forEach((userRecord) => {
      if (
        userRecord.priceId &&
        userRecord.paymentStatus &&
        (userRecord.paymentStatus === 'active' ||
          userRecord.paymentStatus === 'trialing')
      ) {
        const pricePlan = findPlanByPriceId(userRecord.priceId);
        if (pricePlan?.isLifetime && pricePlan?.credits?.enable) {
          lifetimeUsers.push({
            userId: userRecord.userId,
            priceId: userRecord.priceId,
          });
        } else if (!pricePlan?.isFree && pricePlan?.credits?.enable) {
          const yearlyPrice = pricePlan?.prices?.find(
            (p) =>
              p.priceId === userRecord.priceId &&
              p.interval === PlanIntervals.YEAR
          );
          if (yearlyPrice) {
            yearlyUsers.push({
              userId: userRecord.userId,
              priceId: userRecord.priceId,
            });
          }
        }
      } else {
        freeUserIds.push(userRecord.userId);
      }
    });

    if (freePlan && freeUserIds.length > 0) {
      for (let i = 0; i < freeUserIds.length; i += batchSize) {
        const batch = freeUserIds.slice(i, i + batchSize);
        const commands = creditDistributionService.generateFreeCommands({
          userIds: batch,
          plan: freePlan,
          periodKey,
          monthLabel,
        });
        if (commands.length === 0) {
          continue;
        }
        const result = await creditDistributionService.execute(commands);
        processedCount += result.processed;
        errorCount += result.errors.length;
        if (result.errors.length > 0) {
          log.error(
            {
              errors: result.errors,
              batch: i / batchSize + 1,
              flagEnabled: result.flagEnabled,
            },
            'Failed to distribute monthly free credits for some users'
          );
        }
        if (freeUserIds.length > batchSize * 10) {
          log.debug(
            {
              processed: Math.min(i + batchSize, freeUserIds.length),
              total: freeUserIds.length,
              segment: 'free',
              flagEnabled: result.flagEnabled,
            },
            'Progress distributing credits'
          );
        }
      }
    }

    for (let i = 0; i < lifetimeUsers.length; i += batchSize) {
      const batch = lifetimeUsers.slice(i, i + batchSize);
      const commands = creditDistributionService.generateLifetimeCommands({
        users: batch,
        periodKey,
        monthLabel,
      });
      if (commands.length === 0) {
        continue;
      }
      const result = await creditDistributionService.execute(commands);
      processedCount += result.processed;
      errorCount += result.errors.length;
      if (result.errors.length > 0) {
        log.error(
          {
            errors: result.errors,
            batch: i / batchSize + 1,
            flagEnabled: result.flagEnabled,
          },
          'Failed to distribute lifetime monthly credits'
        );
      }

      if (lifetimeUsers.length > batchSize * 10) {
        log.debug(
          {
            processed: Math.min(i + batchSize, lifetimeUsers.length),
            total: lifetimeUsers.length,
            segment: 'lifetime',
            flagEnabled: result.flagEnabled,
          },
          'Progress distributing credits'
        );
      }
    }

    for (let i = 0; i < yearlyUsers.length; i += batchSize) {
      const batch = yearlyUsers.slice(i, i + batchSize);
      const commands = creditDistributionService.generateYearlyCommands({
        users: batch,
        periodKey,
        monthLabel,
      });
      if (commands.length === 0) {
        continue;
      }
      const result = await creditDistributionService.execute(commands);
      processedCount += result.processed;
      errorCount += result.errors.length;
      if (result.errors.length > 0) {
        log.error(
          {
            errors: result.errors,
            batch: i / batchSize + 1,
            flagEnabled: result.flagEnabled,
          },
          'Failed to distribute yearly monthly credits'
        );
      }

      if (yearlyUsers.length > batchSize * 10) {
        log.debug(
          {
            processed: Math.min(i + batchSize, yearlyUsers.length),
            total: yearlyUsers.length,
            segment: 'yearly',
            flagEnabled: result.flagEnabled,
          },
          'Progress distributing credits'
        );
      }
    }

    lastProcessedUserId = userBatch[userBatch.length - 1]?.userId ?? null;
  } while (lastProcessedUserId);

  log.info(
    {
      usersCount,
      processedCount,
      errorCount,
      enableCreditPeriodKey: featureFlags.enableCreditPeriodKey,
    },
    'Finished credit distribution job'
  );
  return { usersCount, processedCount, errorCount };
}
