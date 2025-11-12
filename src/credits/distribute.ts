import { randomUUID } from 'crypto';
import { and, eq, gt, isNull, lt, not, or, sql } from 'drizzle-orm';
import { featureFlags } from '@/config/feature-flags';
import { getDb } from '@/db';
import { creditTransaction, payment, user, userCredit } from '@/db/schema';
import { findPlanByPriceId, getAllPricePlans } from '@/lib/price-plan';
import { getLogger } from '@/lib/server/logger';
import { PlanIntervals, type PricePlan } from '@/payment/types';
import type { CreditCommand } from './distribution/credit-command';
import { CreditDistributionService } from './distribution/credit-distribution-service';
import { CREDIT_TRANSACTION_TYPE } from './types';
import { getPeriodKey } from './utils/period-key';

/**
 * Distribute credits to all users based on their plan type
 * This function is designed to be called by a cron job
 */
const baseLogger = getLogger({ span: 'credits.distribute' });
const creditDistributionService = new CreditDistributionService();

export async function distributeCreditsToAllUsers() {
  const log = baseLogger.child({ span: 'distributeCreditsToAllUsers' });
  log.info('Starting credit distribution job');

  // Process expired credits first before distributing new credits
  log.debug('Processing expired credits before distribution');
  const expiredResult = await batchProcessExpiredCredits();
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
    { usersWithPayments: usersWithPayments.length },
    'Loaded users for credit distribution'
  );

  const now = new Date();
  const monthLabel = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const periodKey = featureFlags.enableCreditPeriodKey
    ? getPeriodKey(now)
    : undefined;
  const freePlan = getAllPricePlans().find(
    (plan) =>
      plan.isFree && plan.credits?.enable && (plan.credits.amount ?? 0) > 0
  );

  const usersCount = usersWithPayments.length;
  let processedCount = 0;
  let errorCount = 0;

  // Separate users by their plan type for batch processing
  const freeUserIds: string[] = [];
  const lifetimeUsers: Array<{ userId: string; priceId: string }> = [];
  const yearlyUsers: Array<{ userId: string; priceId: string }> = [];

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
      const commands = buildFreeMonthlyCommands({
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
          },
          'Progress distributing credits'
        );
      }
    }
  }

  // Process lifetime users in batches
  for (let i = 0; i < lifetimeUsers.length; i += batchSize) {
    const batch = lifetimeUsers.slice(i, i + batchSize);
    const commands = buildPlanMonthlyCommands({
      users: batch,
      periodKey,
      monthLabel,
      creditType: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
      descriptionPrefix: 'Lifetime monthly credits',
      planFilter: (plan) => Boolean(plan?.isLifetime && plan.credits?.enable),
    });
    if (commands.length === 0) {
      continue;
    }
    const result = await creditDistributionService.execute(commands);
    processedCount += result.processed;
    errorCount += result.errors.length;
    if (result.errors.length > 0) {
      log.error(
        { errors: result.errors, batch: i / batchSize + 1 },
        'Failed to distribute lifetime monthly credits'
      );
    }

    if (lifetimeUsers.length > 1000) {
      log.debug(
        {
          processed: Math.min(i + batchSize, lifetimeUsers.length),
          total: lifetimeUsers.length,
          segment: 'lifetime',
        },
        'Progress distributing credits'
      );
    }
  }

  // Process yearly subscription users in batches
  for (let i = 0; i < yearlyUsers.length; i += batchSize) {
    const batch = yearlyUsers.slice(i, i + batchSize);
    const commands = buildPlanMonthlyCommands({
      users: batch,
      periodKey,
      monthLabel,
      creditType: CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      descriptionPrefix: 'Yearly subscription monthly credits',
      planFilter: (plan, priceId) => {
        if (!plan?.credits?.enable) return false;
        const matchedPrice = plan.prices.find(
          (price) =>
            price.priceId === priceId && price.interval === PlanIntervals.YEAR
        );
        return Boolean(matchedPrice);
      },
    });
    if (commands.length === 0) {
      continue;
    }
    const result = await creditDistributionService.execute(commands);
    processedCount += result.processed;
    errorCount += result.errors.length;
    if (result.errors.length > 0) {
      log.error(
        { errors: result.errors, batch: i / batchSize + 1 },
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
        },
        'Progress distributing credits'
      );
    }
  }

  log.info(
    { usersCount, processedCount, errorCount },
    'Finished credit distribution job'
  );
  return { usersCount, processedCount, errorCount };
}

type PlanUserRecord = {
  userId: string;
  priceId: string;
};

function buildFreeMonthlyCommands(options: {
  userIds: string[];
  plan: PricePlan;
  periodKey?: number;
  monthLabel: string;
}): CreditCommand[] {
  const { userIds, plan, periodKey, monthLabel } = options;
  const credits = plan.credits?.amount ?? 0;
  if (!plan.credits?.enable || credits <= 0) {
    return [];
  }
  return userIds.map((userId) => ({
    userId,
    type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
    amount: credits,
    description: `Free monthly credits: ${credits} for ${monthLabel}`,
    expireDays: plan.credits?.expireDays,
    periodKey,
  }));
}

function buildPlanMonthlyCommands(options: {
  users: PlanUserRecord[];
  periodKey?: number;
  monthLabel: string;
  creditType: string;
  descriptionPrefix: string;
  planFilter?: (plan: PricePlan | undefined, priceId: string) => boolean;
}): CreditCommand[] {
  const {
    users,
    periodKey,
    monthLabel,
    creditType,
    descriptionPrefix,
    planFilter,
  } = options;

  const commands: CreditCommand[] = [];
  for (const { userId, priceId } of users) {
    const plan = findPlanByPriceId(priceId);
    if (!plan?.credits?.enable) {
      continue;
    }
    if (planFilter && !planFilter(plan, priceId)) {
      continue;
    }
    const credits = plan.credits.amount ?? 0;
    if (credits <= 0) {
      continue;
    }
    commands.push({
      userId,
      type: creditType,
      amount: credits,
      description: `${descriptionPrefix}: ${credits} for ${monthLabel}`,
      expireDays: plan.credits.expireDays,
      periodKey,
    });
  }
  return commands;
}

/**
 * Batch process expired credits for all users
 * This function is designed to be called by a cron job
 */
export async function batchProcessExpiredCredits() {
  baseLogger.info('>>> batch process expired credits start');

  const db = await getDb();
  const now = new Date();

  // Get all users who have credit transactions that can expire
  const usersWithExpirableCredits = await db
    .selectDistinct({
      userId: creditTransaction.userId,
    })
    .from(creditTransaction)
    .where(
      and(
        // Exclude usage and expire records (these are consumption/expiration logs)
        not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.USAGE)),
        not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.EXPIRE)),
        // Only include transactions with expirationDate set
        not(isNull(creditTransaction.expirationDate)),
        // Only include transactions not yet processed for expiration
        isNull(creditTransaction.expirationDateProcessedAt),
        // Only include transactions with remaining amount > 0
        gt(creditTransaction.remainingAmount, 0),
        // Only include expired transactions
        lt(creditTransaction.expirationDate, now)
      )
    );

  baseLogger.info(
    {
      usersCount: usersWithExpirableCredits.length,
    },
    'batch process expired credits'
  );

  const usersCount = usersWithExpirableCredits.length;
  let processedCount = 0;
  let errorCount = 0;
  let totalExpiredCredits = 0;

  const batchSize = 100;

  // Process users in batches
  for (let i = 0; i < usersWithExpirableCredits.length; i += batchSize) {
    const batch = usersWithExpirableCredits.slice(i, i + batchSize);
    try {
      const batchResult = await batchProcessExpiredCreditsForUsers(
        batch.map((user) => user.userId)
      );
      processedCount += batchResult.processedCount;
      totalExpiredCredits += batchResult.expiredCredits;
    } catch (error) {
      const batchNumber = i / batchSize + 1;
      baseLogger.error(
        { batchNumber, error },
        `batchProcessExpiredCredits error for batch ${batchNumber}`
      );
      errorCount += batch.length;
    }

    // Log progress for large datasets
    if (usersWithExpirableCredits.length > 1000) {
      baseLogger.info(
        `expired credits progress: ${Math.min(i + batchSize, usersWithExpirableCredits.length)}/${usersWithExpirableCredits.length}`
      );
    }
  }

  baseLogger.info(
    `<<< batch process expired credits end, users: ${usersCount}, processed: ${processedCount}, errors: ${errorCount}, total expired credits: ${totalExpiredCredits}`
  );
  return { usersCount, processedCount, errorCount, totalExpiredCredits };
}

/**
 * Batch process expired credits for a group of users
 * @param userIds - Array of user IDs
 */
export async function batchProcessExpiredCreditsForUsers(userIds: string[]) {
  if (userIds.length === 0) {
    baseLogger.info('batchProcessExpiredCreditsForUsers, no users to process');
    return { processedCount: 0, expiredCredits: 0 };
  }

  const db = await getDb();
  const now = new Date();

  let totalProcessedCount = 0;
  let totalExpiredCredits = 0;

  // Use transaction for data consistency
  await db.transaction(async (tx) => {
    for (const userId of userIds) {
      // Get all credit transactions that can expire for this user
      const transactions = await tx
        .select()
        .from(creditTransaction)
        .where(
          and(
            eq(creditTransaction.userId, userId),
            // Exclude usage and expire records (these are consumption/expiration logs)
            not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.USAGE)),
            not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.EXPIRE)),
            // Only include transactions with expirationDate set
            not(isNull(creditTransaction.expirationDate)),
            // Only include transactions not yet processed for expiration
            isNull(creditTransaction.expirationDateProcessedAt),
            // Only include transactions with remaining amount > 0
            gt(creditTransaction.remainingAmount, 0),
            // Only include expired transactions
            lt(creditTransaction.expirationDate, now)
          )
        );

      let expiredTotal = 0;

      // Process expired credit transactions
      for (const transaction of transactions) {
        const remain = transaction.remainingAmount || 0;
        if (remain > 0) {
          expiredTotal += remain;
          await tx
            .update(creditTransaction)
            .set({
              remainingAmount: 0,
              expirationDateProcessedAt: now,
              updatedAt: now,
            })
            .where(eq(creditTransaction.id, transaction.id));
        }
      }

      if (expiredTotal > 0) {
        // Deduct expired credits from balance
        const current = await tx
          .select()
          .from(userCredit)
          .where(eq(userCredit.userId, userId))
          .limit(1);

        const newBalance = Math.max(
          0,
          (current[0]?.currentCredits || 0) - expiredTotal
        );

        await tx
          .update(userCredit)
          .set({ currentCredits: newBalance, updatedAt: now })
          .where(eq(userCredit.userId, userId));

        // Write expire record
        await tx.insert(creditTransaction).values({
          id: randomUUID(),
          userId,
          type: CREDIT_TRANSACTION_TYPE.EXPIRE,
          amount: -expiredTotal,
          remainingAmount: null,
          description: `Expire credits: ${expiredTotal}`,
          createdAt: now,
          updatedAt: now,
        });

        totalExpiredCredits += expiredTotal;
        baseLogger.info(
          `batchProcessExpiredCreditsForUsers, ${expiredTotal} credits expired for user ${userId}`
        );
      }

      totalProcessedCount++;
    }
  });

  baseLogger.info(
    `batchProcessExpiredCreditsForUsers, processed ${totalProcessedCount} users, total expired credits: ${totalExpiredCredits}`
  );

  return {
    processedCount: totalProcessedCount,
    expiredCredits: totalExpiredCredits,
  };
}
