import { and, eq, isNull, or, sql } from 'drizzle-orm';
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

  // Get all users with their current active payments/subscriptions in a single query
  // This uses a LEFT JOIN to get users and their latest active payment in one query
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

  const usersWithPayments = await db
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
    .where(or(isNull(user.banned), eq(user.banned, false)));

  log.info(
    {
      usersWithPayments: usersWithPayments.length,
      enableCreditPeriodKey: featureFlags.enableCreditPeriodKey,
    },
    'Loaded users for credit distribution'
  );

  const now = options?.refDate ?? new Date();
  const monthLabel = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const periodKey = getPeriodKey(now);
  const freePlan = getAllPricePlans().find(
    (plan) =>
      plan.isFree && plan.credits?.enable && (plan.credits.amount ?? 0) > 0
  );

  const usersCount = usersWithPayments.length;
  let processedCount = 0;
  let errorCount = 0;

  // Separate users by their plan type for batch processing
  const freeUserIds: string[] = [];
  const lifetimeUsers: PlanUserRecord[] = [];
  const yearlyUsers: PlanUserRecord[] = [];

  usersWithPayments.forEach((userRecord) => {
    // Check if user has active subscription (status is 'active' or 'trialing')
    if (
      userRecord.priceId &&
      userRecord.paymentStatus &&
      (userRecord.paymentStatus === 'active' ||
        userRecord.paymentStatus === 'trialing')
    ) {
      // User has active subscription - check what type
      const pricePlan = findPlanByPriceId(userRecord.priceId);
      if (pricePlan?.isLifetime && pricePlan?.credits?.enable) {
        lifetimeUsers.push({
          userId: userRecord.userId,
          priceId: userRecord.priceId,
        });
      } else if (!pricePlan?.isFree && pricePlan?.credits?.enable) {
        // Check if this is a yearly subscription that needs monthly credits
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
        // Monthly subscriptions are handled by Stripe webhooks automatically
      }
    } else {
      // User has no active subscription - add free monthly credits if enabled
      freeUserIds.push(userRecord.userId);
    }
  });

  log.debug(
    {
      lifetimeUsers: lifetimeUsers.length,
      freeUsers: freeUserIds.length,
      yearlyUsers: yearlyUsers.length,
    },
    'Partitioned users for credit distribution'
  );

  const batchSize = 100;

  if (!freePlan) {
    log.info('Free plan credits disabled, skipping free users');
  } else {
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
      if (freeUserIds.length > 1000) {
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

  // Process lifetime users in batches
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

    if (lifetimeUsers.length > 1000) {
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

  // Process yearly subscription users in batches
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

    // Log progress for large datasets
    if (yearlyUsers.length > 1000) {
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
