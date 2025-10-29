import { randomUUID } from 'crypto';
import { websiteConfig } from '@/config/website';
import { getDb } from '@/db';
import { creditTransaction, userCredit } from '@/db/schema';
import { findPlanByPlanId, findPlanByPriceId } from '@/lib/price-plan';
import { addDays, isAfter } from 'date-fns';
import { and, asc, eq, gt, isNull, not, or, sql } from 'drizzle-orm';
import { CREDIT_TRANSACTION_TYPE } from './types';

/**
 * Get user's current credit balance
 * @param userId - User ID
 * @returns User's current credit balance
 */
export async function getUserCredits(userId: string): Promise<number> {
  try {
    const db = await getDb();

    // Optimized query: only select the needed field
    // This can benefit from covering index if we add one later
    const record = await db
      .select({ currentCredits: userCredit.currentCredits })
      .from(userCredit)
      .where(eq(userCredit.userId, userId))
      .limit(1);

    return record[0]?.currentCredits || 0;
  } catch (error) {
    console.error('getUserCredits, error:', error);
    // Return 0 on error to prevent UI from breaking
    return 0;
  }
}

/**
 * Update user's current credit balance
 * @param userId - User ID
 * @param credits - New credit balance
 */
export async function updateUserCredits(userId: string, credits: number) {
  try {
    const db = await getDb();
    await db
      .update(userCredit)
      .set({ currentCredits: credits, updatedAt: new Date() })
      .where(eq(userCredit.userId, userId));
  } catch (error) {
    console.error('updateUserCredits, error:', error);
  }
}

/**
 * Write a credit transaction record
 * @param params - Credit transaction parameters
 */
export async function saveCreditTransaction({
  userId,
  type,
  amount,
  description,
  paymentId,
  expirationDate,
}: {
  userId: string;
  type: string;
  amount: number;
  description: string;
  paymentId?: string;
  expirationDate?: Date;
}) {
  if (!userId || !type || !description) {
    console.error(
      'saveCreditTransaction, invalid params',
      userId,
      type,
      description
    );
    throw new Error('saveCreditTransaction, invalid params');
  }
  if (!Number.isFinite(amount) || amount === 0) {
    console.error('saveCreditTransaction, invalid amount', userId, amount);
    throw new Error('saveCreditTransaction, invalid amount');
  }
  const db = await getDb();
  await db.insert(creditTransaction).values({
    id: randomUUID(),
    userId,
    type,
    amount,
    // remaining amount is the same as amount for earn transactions
    // remaining amount is null for spend transactions
    remainingAmount: amount > 0 ? amount : null,
    description,
    paymentId,
    expirationDate,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/**
 * Add credits (registration, monthly, purchase, etc.)
 * @param params - Credit creation parameters
 */
export async function addCredits({
  userId,
  amount,
  type,
  description,
  paymentId,
  expireDays,
}: {
  userId: string;
  amount: number;
  type: string;
  description: string;
  paymentId?: string;
  expireDays?: number;
}) {
  if (!userId || !type || !description) {
    console.error('addCredits, invalid params', userId, type, description);
    throw new Error('Invalid params');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error('addCredits, invalid amount', userId, amount);
    throw new Error('Invalid amount');
  }
  if (
    expireDays !== undefined &&
    (!Number.isFinite(expireDays) || expireDays <= 0)
  ) {
    console.error('addCredits, invalid expire days', userId, expireDays);
    throw new Error('Invalid expire days');
  }
  // Update user credit balance
  const db = await getDb();
  const current = await db
    .select()
    .from(userCredit)
    .where(eq(userCredit.userId, userId))
    .limit(1);
  // const newBalance = (current[0]?.currentCredits || 0) + amount;
  if (current.length > 0) {
    const newBalance = (current[0]?.currentCredits || 0) + amount;
    console.log('addCredits, update user credit', userId, newBalance);
    await db
      .update(userCredit)
      .set({
        currentCredits: newBalance,
        updatedAt: new Date(),
      })
      .where(eq(userCredit.userId, userId));
  } else {
    const newBalance = amount;
    console.log('addCredits, insert user credit', userId, newBalance);
    await db.insert(userCredit).values({
      id: randomUUID(),
      userId,
      currentCredits: newBalance,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  // Write credit transaction record
  await saveCreditTransaction({
    userId,
    type,
    amount,
    description,
    paymentId,
    expirationDate: expireDays ? addDays(new Date(), expireDays) : undefined,
  });
}

/**
 * Check if user has enough credits
 * @param userId - User ID
 * @param requiredCredits - Required credits
 */
export async function hasEnoughCredits({
  userId,
  requiredCredits,
}: {
  userId: string;
  requiredCredits: number;
}) {
  const balance = await getUserCredits(userId);
  return balance >= requiredCredits;
}

/**
 * Consume credits (FIFO, by expiration)
 * @param params - Credit consumption parameters
 */
export async function consumeCredits({
  userId,
  amount,
  description,
}: {
  userId: string;
  amount: number;
  description: string;
}) {
  if (!userId || !description) {
    console.error('consumeCredits, invalid params', userId, description);
    throw new Error('Invalid params');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error('consumeCredits, invalid amount', userId, amount);
    throw new Error('Invalid amount');
  }
  // Check balance
  if (!(await hasEnoughCredits({ userId, requiredCredits: amount }))) {
    console.error(
      `consumeCredits, insufficient credits for user ${userId}, required: ${amount}`
    );
    throw new Error('Insufficient credits');
  }
  // FIFO consumption: consume from the earliest unexpired credits first
  const db = await getDb();
  const now = new Date();
  const transactions = await db
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        // Exclude usage and expire records (these are consumption/expiration logs)
        not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.USAGE)),
        not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.EXPIRE)),
        // Only include transactions with remaining amount > 0
        gt(creditTransaction.remainingAmount, 0),
        // Only include unexpired credits (either no expiration date or not yet expired)
        or(
          isNull(creditTransaction.expirationDate),
          gt(creditTransaction.expirationDate, now)
        )
      )
    )
    .orderBy(
      asc(creditTransaction.expirationDate),
      asc(creditTransaction.createdAt)
    );
  // Consume credits
  let remainingToDeduct = amount;
  for (const transaction of transactions) {
    if (remainingToDeduct <= 0) break;
    const remainingAmount = transaction.remainingAmount || 0;
    if (remainingAmount <= 0) continue;
    // credits to consume at most in this transaction
    const deductFromThis = Math.min(remainingAmount, remainingToDeduct);
    await db
      .update(creditTransaction)
      .set({
        remainingAmount: remainingAmount - deductFromThis,
        updatedAt: new Date(),
      })
      .where(eq(creditTransaction.id, transaction.id));
    remainingToDeduct -= deductFromThis;
  }
  // Update balance
  const current = await db
    .select()
    .from(userCredit)
    .where(eq(userCredit.userId, userId))
    .limit(1);
  const newBalance = (current[0]?.currentCredits || 0) - amount;
  await db
    .update(userCredit)
    .set({ currentCredits: newBalance, updatedAt: new Date() })
    .where(eq(userCredit.userId, userId));
  // Write usage record
  await saveCreditTransaction({
    userId,
    type: CREDIT_TRANSACTION_TYPE.USAGE,
    amount: -amount,
    description,
  });
}

/**
 * Process expired credits
 * @param userId - User ID
 * @deprecated This function is no longer used, see distribute.ts instead
 */
export async function processExpiredCredits(userId: string) {
  const now = new Date();
  // Get all credit transactions that can expire (have expirationDate and not yet processed)
  const db = await getDb();
  const transactions = await db
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
        gt(creditTransaction.remainingAmount, 0)
      )
    );
  let expiredTotal = 0;
  // Process expired credit transactions
  for (const transaction of transactions) {
    if (
      transaction.expirationDate &&
      isAfter(now, transaction.expirationDate) &&
      !transaction.expirationDateProcessedAt
    ) {
      const remain = transaction.remainingAmount || 0;
      if (remain > 0) {
        expiredTotal += remain;
        await db
          .update(creditTransaction)
          .set({
            remainingAmount: 0,
            expirationDateProcessedAt: now,
            updatedAt: now,
          })
          .where(eq(creditTransaction.id, transaction.id));
      }
    }
  }
  if (expiredTotal > 0) {
    // Deduct expired credits from balance
    const current = await db
      .select()
      .from(userCredit)
      .where(eq(userCredit.userId, userId))
      .limit(1);
    const newBalance = Math.max(
      0,
      (current[0]?.currentCredits || 0) - expiredTotal
    );
    await db
      .update(userCredit)
      .set({ currentCredits: newBalance, updatedAt: now })
      .where(eq(userCredit.userId, userId));
    // Write expire record
    await saveCreditTransaction({
      userId,
      type: CREDIT_TRANSACTION_TYPE.EXPIRE,
      amount: -expiredTotal,
      description: `Expire credits: ${expiredTotal}`,
    });

    console.log(
      `processExpiredCredits, ${expiredTotal} credits expired for user ${userId}`
    );
  }
}

/**
 * Check if specific type of credits can be added for a user based on transaction history
 * @param userId - User ID
 * @param creditType - Type of credit transaction to check
 */
export async function canAddCreditsByType(userId: string, creditType: string) {
  const db = await getDb();
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Check if user has already received this type of credits this month
  const existingTransaction = await db
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        eq(creditTransaction.type, creditType),
        // Check if transaction was created in the current month and year
        sql`EXTRACT(MONTH FROM ${creditTransaction.createdAt}) = ${currentMonth + 1}`,
        sql`EXTRACT(YEAR FROM ${creditTransaction.createdAt}) = ${currentYear}`
      )
    )
    .limit(1);

  return existingTransaction.length === 0;
}

/**
 * Check if subscription credits can be added for a user based on last refresh time
 * @param userId - User ID
 */

/**
 * Add register gift credits
 * @param userId - User ID
 */
export async function addRegisterGiftCredits(userId: string) {
  // Check if user has already received register gift credits
  const db = await getDb();
  const record = await db
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.REGISTER_GIFT)
      )
    )
    .limit(1);

  // add register gift credits if user has not received them yet
  if (record.length === 0) {
    const credits = websiteConfig.credits.registerGiftCredits.amount;
    const expireDays = websiteConfig.credits.registerGiftCredits.expireDays;
    await addCredits({
      userId,
      amount: credits,
      type: CREDIT_TRANSACTION_TYPE.REGISTER_GIFT,
      description: `Register gift credits: ${credits}`,
      expireDays,
    });

    console.log(
      `addRegisterGiftCredits, ${credits} credits for user ${userId}`
    );
  }
}

/**
 * Add free monthly credits
 * @param userId - User ID
 * @param planId - Plan ID
 */
export async function addMonthlyFreeCredits(userId: string, planId: string) {
  // NOTICE: make sure the free plan is not disabled and has credits enabled
  const pricePlan = findPlanByPlanId(planId);
  if (
    !pricePlan ||
    pricePlan.disabled ||
    !pricePlan.isFree ||
    !pricePlan.credits ||
    !pricePlan.credits.enable
  ) {
    console.log(
      `addMonthlyFreeCredits, no credits configured for plan ${planId}`
    );
    return;
  }

  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH
  );
  const now = new Date();

  // add credits if it's a new month
  if (canAdd) {
    const credits = pricePlan.credits?.amount || 0;
    const expireDays = pricePlan.credits?.expireDays || 0;
    await addCredits({
      userId,
      amount: credits,
      type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
      description: `Free monthly credits: ${credits} for ${now.getFullYear()}-${now.getMonth() + 1}`,
      expireDays,
    });

    console.log(
      `addMonthlyFreeCredits, ${credits} credits for user ${userId}, date: ${now.getFullYear()}-${now.getMonth() + 1}`
    );
  } else {
    console.log(
      `addMonthlyFreeCredits, no new month for user ${userId}, date: ${now.getFullYear()}-${now.getMonth() + 1}`
    );
  }
}

/**
 * Add subscription credits
 * @param userId - User ID
 * @param priceId - Price ID
 */
export async function addSubscriptionCredits(userId: string, priceId: string) {
  // NOTICE: the price plan maybe disabled, but we still need to add credits for existing users
  const pricePlan = findPlanByPriceId(priceId);
  if (
    !pricePlan ||
    // pricePlan.disabled ||
    !pricePlan.credits ||
    !pricePlan.credits.enable
  ) {
    console.log(
      `addSubscriptionCredits, no credits configured for plan ${priceId}`
    );
    return;
  }

  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL
  );
  const now = new Date();

  // Add credits if it's a new month
  if (canAdd) {
    const credits = pricePlan.credits.amount;
    const expireDays = pricePlan.credits.expireDays;

    await addCredits({
      userId,
      amount: credits,
      type: CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      description: `Subscription renewal credits: ${credits} for ${now.getFullYear()}-${now.getMonth() + 1}`,
      expireDays,
    });

    console.log(
      `addSubscriptionCredits, ${credits} credits for user ${userId}, priceId: ${priceId}, date: ${now.getFullYear()}-${now.getMonth() + 1}`
    );
  } else {
    console.log(
      `addSubscriptionCredits, no new month for user ${userId}, date: ${now.getFullYear()}-${now.getMonth() + 1}`
    );
  }
}

/**
 * Add lifetime monthly credits
 * @param userId - User ID
 * @param priceId - Price ID
 */
export async function addLifetimeMonthlyCredits(
  userId: string,
  priceId: string
) {
  // NOTICE: make sure the lifetime plan is not disabled and has credits enabled
  const pricePlan = findPlanByPriceId(priceId);
  if (
    !pricePlan ||
    !pricePlan.isLifetime ||
    pricePlan.disabled ||
    !pricePlan.credits ||
    !pricePlan.credits.enable
  ) {
    console.log(
      `addLifetimeMonthlyCredits, no credits configured for plan ${priceId}`
    );
    return;
  }

  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY
  );
  const now = new Date();

  // Add credits if it's a new month
  if (canAdd) {
    const credits = pricePlan.credits.amount;
    const expireDays = pricePlan.credits.expireDays;

    await addCredits({
      userId,
      amount: credits,
      type: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
      description: `Lifetime monthly credits: ${credits} for ${now.getFullYear()}-${now.getMonth() + 1}`,
      expireDays,
    });

    console.log(
      `addLifetimeMonthlyCredits, ${credits} credits for user ${userId}, date: ${now.getFullYear()}-${now.getMonth() + 1}`
    );
  } else {
    console.log(
      `addLifetimeMonthlyCredits, no new month for user ${userId}, date: ${now.getFullYear()}-${now.getMonth() + 1}`
    );
  }
}
