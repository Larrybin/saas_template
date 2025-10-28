import { randomUUID } from 'crypto';
import { getDb } from '@/db';
import { creditTransaction, payment, user, userCredit } from '@/db/schema';
import { findPlanByPriceId, getAllPricePlans } from '@/lib/price-plan';
import { PlanIntervals } from '@/payment/types';
import { addDays } from 'date-fns';
import { and, eq, gt, inArray, isNull, lt, not, or, sql } from 'drizzle-orm';
import { canAddCreditsByType } from './credits';
import { CREDIT_TRANSACTION_TYPE } from './types';

/**
 * Distribute credits to all users based on their plan type
 * This function is designed to be called by a cron job
 */
export async function distributeCreditsToAllUsers() {
  console.log('>>> distribute credits start');

  // Process expired credits first before distributing new credits
  console.log('Processing expired credits before distribution...');
  const expiredResult = await batchProcessExpiredCredits();
  console.log('Expired credits processed:', expiredResult);

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

  console.log('distribute credits, users count:', usersWithPayments.length);

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

  console.log(
    `distribute credits, lifetime users: ${lifetimeUsers.length}, free users: ${freeUserIds.length}, yearly users: ${yearlyUsers.length}`
  );

  const batchSize = 100;

  // Process free users in batches
  for (let i = 0; i < freeUserIds.length; i += batchSize) {
    const batch = freeUserIds.slice(i, i + batchSize);
    try {
      await batchAddMonthlyFreeCredits(batch);
      processedCount += batch.length;
    } catch (error) {
      console.error(
        `batchAddMonthlyFreeCredits error for batch ${i / batchSize + 1}:`,
        error
      );
      errorCount += batch.length;
    }

    // Log progress for large datasets
    if (freeUserIds.length > 1000) {
      console.log(
        `free credits progress: ${Math.min(i + batchSize, freeUserIds.length)}/${freeUserIds.length}`
      );
    }
  }

  // Process lifetime users in batches
  for (let i = 0; i < lifetimeUsers.length; i += batchSize) {
    const batch = lifetimeUsers.slice(i, i + batchSize);
    try {
      await batchAddLifetimeMonthlyCredits(batch);
      processedCount += batch.length;
    } catch (error) {
      console.error(
        `batchAddLifetimeMonthlyCredits error for batch ${i / batchSize + 1}:`,
        error
      );
      errorCount += batch.length;
    }

    // Log progress for large datasets
    if (lifetimeUsers.length > 1000) {
      console.log(
        `lifetime credits progress: ${Math.min(i + batchSize, lifetimeUsers.length)}/${lifetimeUsers.length}`
      );
    }
  }

  // Process yearly subscription users in batches
  for (let i = 0; i < yearlyUsers.length; i += batchSize) {
    const batch = yearlyUsers.slice(i, i + batchSize);
    try {
      await batchAddYearlyUsersMonthlyCredits(batch);
      processedCount += batch.length;
    } catch (error) {
      console.error(
        `batchAddYearlyUsersMonthlyCredits error for batch ${i / batchSize + 1}:`,
        error
      );
      errorCount += batch.length;
    }

    // Log progress for large datasets
    if (yearlyUsers.length > 1000) {
      console.log(
        `yearly subscription credits progress: ${Math.min(i + batchSize, yearlyUsers.length)}/${yearlyUsers.length}`
      );
    }
  }

  console.log(
    `<<< distribute credits end, users: ${usersCount}, processed: ${processedCount}, errors: ${errorCount}`
  );
  return { usersCount, processedCount, errorCount };
}

/**
 * Batch add monthly free credits to multiple users
 * @param userIds - Array of user IDs
 */
export async function batchAddMonthlyFreeCredits(userIds: string[]) {
  if (userIds.length === 0) {
    console.log('batchAddMonthlyFreeCredits, no users to add credits');
    return;
  }

  // NOTICE: make sure the free plan is not disabled and has credits enabled
  const pricePlans = getAllPricePlans();
  const freePlan = pricePlans.find(
    (plan) =>
      plan.isFree &&
      !plan.disabled &&
      plan.credits?.enable &&
      plan.credits?.amount > 0
  );
  if (!freePlan) {
    console.log('batchAddMonthlyFreeCredits, no available free plan');
    return;
  }

  const db = await getDb();
  const now = new Date();
  const credits = freePlan.credits?.amount || 0;
  const expireDays = freePlan.credits?.expireDays || 0;

  // Use transaction for data consistency
  let processedCount = 0;
  await db.transaction(async (tx) => {
    // Get all user credit records in one query
    const userCredits = await tx
      .select({
        userId: userCredit.userId,
        currentCredits: userCredit.currentCredits,
      })
      .from(userCredit)
      .where(inArray(userCredit.userId, userIds));

    // Create a map for quick lookup
    const userCreditMap = new Map(
      userCredits.map((record) => [record.userId, record])
    );

    // Check which users can receive credits based on transaction history
    const eligibleUserIds: string[] = [];
    for (const userId of userIds) {
      const canAdd = await canAddCreditsByType(
        userId,
        CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH
      );
      if (canAdd) {
        eligibleUserIds.push(userId);
      }
    }

    if (eligibleUserIds.length === 0) {
      console.log('batchAddMonthlyFreeCredits, no eligible users');
      return;
    }

    processedCount = eligibleUserIds.length;
    const expirationDate = expireDays ? addDays(now, expireDays) : undefined;

    // Batch insert credit transactions
    const transactions = eligibleUserIds.map((userId) => ({
      id: randomUUID(),
      userId,
      type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
      amount: credits,
      remainingAmount: credits,
      description: `Free monthly credits: ${credits} for ${now.getFullYear()}-${now.getMonth() + 1}`,
      expirationDate,
      createdAt: now,
      updatedAt: now,
    }));

    await tx.insert(creditTransaction).values(transactions);

    // Prepare user credit updates
    const existingUserIds = eligibleUserIds.filter((userId) =>
      userCreditMap.has(userId)
    );
    const newUserIds = eligibleUserIds.filter(
      (userId) => !userCreditMap.has(userId)
    );

    // Insert new user credit records
    if (newUserIds.length > 0) {
      const newRecords = newUserIds.map((userId) => ({
        id: randomUUID(),
        userId,
        currentCredits: credits,
        createdAt: now,
        updatedAt: now,
      }));
      await tx.insert(userCredit).values(newRecords);
    }

    // Update existing user credit records
    if (existingUserIds.length > 0) {
      // Update each user individually to add credits to their existing balance
      for (const userId of existingUserIds) {
        const currentRecord = userCreditMap.get(userId);
        const newBalance = (currentRecord?.currentCredits || 0) + credits;
        await tx
          .update(userCredit)
          .set({
            currentCredits: newBalance,
            updatedAt: now,
          })
          .where(eq(userCredit.userId, userId));
      }
    }
  });

  console.log(
    `batchAddMonthlyFreeCredits, ${credits} credits for ${processedCount} users, date: ${now.getFullYear()}-${now.getMonth() + 1}`
  );
}

/**
 * Batch add lifetime monthly credits to multiple users
 * @param users - Array of user objects with userId and priceId
 */
export async function batchAddLifetimeMonthlyCredits(
  users: Array<{ userId: string; priceId: string }>
) {
  if (users.length === 0) {
    console.log('batchAddLifetimeMonthlyCredits, no users to add credits');
    return;
  }

  const db = await getDb();
  const now = new Date();

  // Group users by their priceId to handle different lifetime plans
  const usersByPriceId = new Map<string, string[]>();
  users.forEach((user) => {
    if (!usersByPriceId.has(user.priceId)) {
      usersByPriceId.set(user.priceId, []);
    }
    usersByPriceId.get(user.priceId)!.push(user.userId);
  });

  let totalProcessedCount = 0;

  // Process each priceId group separately
  for (const [priceId, userIdsForPrice] of usersByPriceId) {
    const pricePlan = findPlanByPriceId(priceId);
    if (
      !pricePlan ||
      !pricePlan.isLifetime ||
      // pricePlan.disabled ||
      !pricePlan.credits?.enable ||
      !pricePlan.credits?.amount
    ) {
      console.log(
        `batchAddLifetimeMonthlyCredits, invalid plan for priceId: ${priceId}`
      );
      continue;
    }

    const credits = pricePlan.credits.amount;
    const expireDays = pricePlan.credits.expireDays;

    // Use transaction for data consistency
    let processedCount = 0;
    await db.transaction(async (tx) => {
      // Get all user credit records in one query
      const userCredits = await tx
        .select({
          userId: userCredit.userId,
          currentCredits: userCredit.currentCredits,
        })
        .from(userCredit)
        .where(inArray(userCredit.userId, userIdsForPrice));

      // Create a map for quick lookup
      const userCreditMap = new Map(
        userCredits.map((record) => [record.userId, record])
      );

      // Check which users can receive credits based on transaction history
      const eligibleUserIds: string[] = [];
      for (const userId of userIdsForPrice) {
        const canAdd = await canAddCreditsByType(
          userId,
          CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY
        );
        if (canAdd) {
          eligibleUserIds.push(userId);
        }
      }

      if (eligibleUserIds.length === 0) {
        console.log(
          `batchAddLifetimeMonthlyCredits, no eligible users for priceId: ${priceId}`
        );
        return;
      }

      processedCount = eligibleUserIds.length;
      const expirationDate = expireDays ? addDays(now, expireDays) : undefined;

      // Batch insert credit transactions
      const transactions = eligibleUserIds.map((userId: string) => ({
        id: randomUUID(),
        userId,
        type: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
        amount: credits,
        remainingAmount: credits,
        description: `Lifetime monthly credits: ${credits} for ${now.getFullYear()}-${now.getMonth() + 1}`,
        expirationDate,
        createdAt: now,
        updatedAt: now,
      }));

      await tx.insert(creditTransaction).values(transactions);

      // Prepare user credit updates
      const existingUserIds = eligibleUserIds.filter((userId: string) =>
        userCreditMap.has(userId)
      );
      const newUserIds = eligibleUserIds.filter(
        (userId: string) => !userCreditMap.has(userId)
      );

      // Insert new user credit records
      if (newUserIds.length > 0) {
        const newRecords = newUserIds.map((userId: string) => ({
          id: randomUUID(),
          userId,
          currentCredits: credits,
          createdAt: now,
          updatedAt: now,
        }));
        await tx.insert(userCredit).values(newRecords);
      }

      // Update existing user credit records
      if (existingUserIds.length > 0) {
        // Update each user individually to add credits to their existing balance
        for (const userId of existingUserIds) {
          const currentRecord = userCreditMap.get(userId);
          const newBalance = (currentRecord?.currentCredits || 0) + credits;
          await tx
            .update(userCredit)
            .set({
              currentCredits: newBalance,
              updatedAt: now,
            })
            .where(eq(userCredit.userId, userId));
        }
      }
    });

    totalProcessedCount += processedCount;
    console.log(
      `batchAddLifetimeMonthlyCredits, ${credits} credits for ${processedCount} users with priceId ${priceId}, date: ${now.getFullYear()}-${now.getMonth() + 1}`
    );
  }

  console.log(
    `batchAddLifetimeMonthlyCredits, total processed: ${totalProcessedCount} users`
  );
}

/**
 * Batch add monthly credits to yearly subscription users
 * @param users - Array of user objects with userId and priceId
 */
export async function batchAddYearlyUsersMonthlyCredits(
  users: Array<{ userId: string; priceId: string }>
) {
  if (users.length === 0) {
    console.log('batchAddYearlyUsersMonthlyCredits, no users to add credits');
    return;
  }

  const db = await getDb();
  const now = new Date();

  // Group users by priceId to batch process users with the same plan
  const usersByPriceId = new Map<string, string[]>();
  users.forEach(({ userId, priceId }) => {
    if (!usersByPriceId.has(priceId)) {
      usersByPriceId.set(priceId, []);
    }
    usersByPriceId.get(priceId)!.push(userId);
  });

  let totalProcessedCount = 0;

  // Process each price group
  for (const [priceId, userIds] of usersByPriceId) {
    const pricePlan = findPlanByPriceId(priceId);
    if (!pricePlan || !pricePlan.credits || !pricePlan.credits.enable) {
      console.log(
        `batchAddYearlyUsersMonthlyCredits, plan disabled or credits disabled for priceId: ${priceId}`
      );
      continue;
    }

    const credits = pricePlan.credits.amount;
    const expireDays = pricePlan.credits.expireDays;

    // Use transaction for data consistency
    let processedCount = 0;
    await db.transaction(async (tx) => {
      // Get all user credit records in one query
      const userCredits = await tx
        .select({
          userId: userCredit.userId,
          currentCredits: userCredit.currentCredits,
        })
        .from(userCredit)
        .where(inArray(userCredit.userId, userIds));

      // Create a map for quick lookup
      const userCreditMap = new Map(
        userCredits.map((record) => [record.userId, record])
      );

      // Check which users can receive credits based on transaction history
      const eligibleUserIds: string[] = [];
      for (const userId of userIds) {
        const canAdd = await canAddCreditsByType(
          userId,
          CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL
        );
        if (canAdd) {
          eligibleUserIds.push(userId);
        }
      }

      if (eligibleUserIds.length === 0) {
        console.log(
          `batchAddYearlyUsersMonthlyCredits, no eligible users for priceId: ${priceId}`
        );
        return;
      }

      processedCount = eligibleUserIds.length;
      const expirationDate = expireDays ? addDays(now, expireDays) : undefined;

      // Batch insert credit transactions
      const transactions = eligibleUserIds.map((userId) => ({
        id: randomUUID(),
        userId,
        type: CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
        amount: credits,
        remainingAmount: credits,
        description: `Yearly subscription monthly credits: ${credits} for ${now.getFullYear()}-${now.getMonth() + 1}`,
        expirationDate,
        createdAt: now,
        updatedAt: now,
      }));

      await tx.insert(creditTransaction).values(transactions);

      // Prepare user credit updates
      const existingUserIds = eligibleUserIds.filter((userId) =>
        userCreditMap.has(userId)
      );
      const newUserIds = eligibleUserIds.filter(
        (userId) => !userCreditMap.has(userId)
      );

      // Insert new user credit records
      if (newUserIds.length > 0) {
        const newRecords = newUserIds.map((userId) => ({
          id: randomUUID(),
          userId,
          currentCredits: credits,
          createdAt: now,
          updatedAt: now,
        }));
        await tx.insert(userCredit).values(newRecords);
      }

      // Update existing user credit records
      if (existingUserIds.length > 0) {
        // Update each user individually to add credits to their existing balance
        for (const userId of existingUserIds) {
          const currentRecord = userCreditMap.get(userId);
          const newBalance = (currentRecord?.currentCredits || 0) + credits;
          await tx
            .update(userCredit)
            .set({
              currentCredits: newBalance,
              updatedAt: now,
            })
            .where(eq(userCredit.userId, userId));
        }
      }
    });

    totalProcessedCount += processedCount;
    console.log(
      `batchAddYearlyUsersMonthlyCredits, ${credits} credits for ${processedCount} users with priceId: ${priceId}, date: ${now.getFullYear()}-${now.getMonth() + 1}`
    );
  }

  console.log(
    `batchAddYearlyUsersMonthlyCredits completed, total processed: ${totalProcessedCount} users`
  );
}

/**
 * Batch process expired credits for all users
 * This function is designed to be called by a cron job
 */
export async function batchProcessExpiredCredits() {
  console.log('>>> batch process expired credits start');

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

  console.log(
    'batch process expired credits, users count:',
    usersWithExpirableCredits.length
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
      console.error(
        `batchProcessExpiredCredits error for batch ${i / batchSize + 1}:`,
        error
      );
      errorCount += batch.length;
    }

    // Log progress for large datasets
    if (usersWithExpirableCredits.length > 1000) {
      console.log(
        `expired credits progress: ${Math.min(i + batchSize, usersWithExpirableCredits.length)}/${usersWithExpirableCredits.length}`
      );
    }
  }

  console.log(
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
    console.log('batchProcessExpiredCreditsForUsers, no users to process');
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
        console.log(
          `batchProcessExpiredCreditsForUsers, ${expiredTotal} credits expired for user ${userId}`
        );
      }

      totalProcessedCount++;
    }
  });

  console.log(
    `batchProcessExpiredCreditsForUsers, processed ${totalProcessedCount} users, total expired credits: ${totalExpiredCredits}`
  );

  return {
    processedCount: totalProcessedCount,
    expiredCredits: totalExpiredCredits,
  };
}
