import { randomUUID } from 'crypto';
import { addDays, isAfter } from 'date-fns';
import { and, asc, eq, gt, isNull, not, or, sql } from 'drizzle-orm';
import { websiteConfig } from '@/config/website';
import { getDb } from '@/db';
import { creditTransaction, userCredit } from '@/db/schema';
import { findPlanByPlanId, findPlanByPriceId } from '@/lib/price-plan';
import { CreditLedgerRepository } from '../data-access/credit-ledger-repository';
import { CREDIT_TRANSACTION_TYPE } from '../types';
import type { AddCreditsPayload, CreditsGateway } from './credits-gateway';

export const creditLedgerRepository = new CreditLedgerRepository();

function compareTransactionsByExpiry(
  a: typeof creditTransaction.$inferSelect,
  b: typeof creditTransaction.$inferSelect
) {
  const aExpire = a.expirationDate ?? null;
  const bExpire = b.expirationDate ?? null;
  if (aExpire && bExpire) {
    const diff = aExpire.getTime() - bExpire.getTime();
    if (diff !== 0) {
      return diff;
    }
  }
  if (aExpire && !bExpire) {
    return -1;
  }
  if (!aExpire && bExpire) {
    return 1;
  }
  const aCreated = a.createdAt?.getTime() ?? 0;
  const bCreated = b.createdAt?.getTime() ?? 0;
  return aCreated - bCreated;
}

export async function getUserCredits(userId: string): Promise<number> {
  try {
    const record = await creditLedgerRepository.findUserCredit(userId);
    return record?.currentCredits ?? 0;
  } catch (error) {
    console.error('getUserCredits, error:', error);
    return 0;
  }
}

export async function updateUserCredits(userId: string, credits: number) {
  try {
    await creditLedgerRepository.updateUserCredits(userId, credits);
  } catch (error) {
    console.error('updateUserCredits, error:', error);
  }
}

export async function saveCreditTransaction(options: {
  userId: string;
  type: string;
  amount: number;
  description: string;
  paymentId?: string;
  expirationDate?: Date;
}) {
  const { userId, type, amount, description, paymentId, expirationDate } =
    options;
  if (!userId || !type || !description) {
    throw new Error('saveCreditTransaction, invalid params');
  }
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error('saveCreditTransaction, invalid amount');
  }
  await creditLedgerRepository.insertTransaction({
    id: randomUUID(),
    userId,
    type,
    amount,
    remainingAmount: amount > 0 ? amount : null,
    description,
    paymentId,
    expirationDate,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function addCredits(payload: {
  userId: string;
  amount: number;
  type: string;
  description: string;
  paymentId?: string;
  expireDays?: number;
}) {
  const { userId, amount, type, description, paymentId, expireDays } = payload;
  if (!userId || !type || !description) {
    throw new Error('Invalid params');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid amount');
  }
  const hasExpireConfig = expireDays !== undefined && expireDays !== null;
  if (hasExpireConfig) {
    if (!Number.isFinite(expireDays) || expireDays < 0) {
      throw new Error('Invalid expire days');
    }
  }
  const current = await creditLedgerRepository.findUserCredit(userId);
  const newBalance = (current?.currentCredits ?? 0) + amount;
  await creditLedgerRepository.upsertUserCredit(userId, newBalance);

  const expirationDate =
    hasExpireConfig && expireDays && expireDays > 0
      ? addDays(new Date(), expireDays)
      : undefined;

  await saveCreditTransaction({
    userId,
    type,
    amount,
    description,
    paymentId,
    expirationDate,
  });
}

export async function hasEnoughCredits(options: {
  userId: string;
  requiredCredits: number;
}) {
  const balance = await getUserCredits(options.userId);
  return balance >= options.requiredCredits;
}

export async function consumeCredits(payload: {
  userId: string;
  amount: number;
  description: string;
}) {
  const { userId, amount, description } = payload;
  if (!userId || !description) {
    throw new Error('Invalid params');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid amount');
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    const balanceRecord = await creditLedgerRepository.findUserCredit(
      userId,
      tx
    );
    const currentBalance = balanceRecord?.currentCredits ?? 0;
    if (currentBalance < amount) {
      throw new Error('Insufficient credits');
    }
    const transactions = (
      await creditLedgerRepository.findFifoEligibleTransactions(userId, tx)
    ).sort(compareTransactionsByExpiry);
    let remainingToDeduct = amount;
    for (const trx of transactions) {
      if (remainingToDeduct <= 0) break;
      const remainingAmount = trx.remainingAmount ?? 0;
      if (remainingAmount <= 0) continue;
      const deductFromThis = Math.min(remainingAmount, remainingToDeduct);
      await creditLedgerRepository.updateTransactionRemainingAmount(
        trx.id,
        remainingAmount - deductFromThis,
        tx
      );
      remainingToDeduct -= deductFromThis;
    }
    if (remainingToDeduct > 0) {
      throw new Error('Insufficient credits');
    }
    const newBalance = currentBalance - amount;
    await creditLedgerRepository.updateUserCredits(userId, newBalance, tx);
    await creditLedgerRepository.insertUsageRecord(
      {
        userId,
        amount: -amount,
        description,
      },
      tx
    );
  });
}

export async function processExpiredCredits(userId: string) {
  const now = new Date();
  const db = await getDb();
  const transactions = await db
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.USAGE)),
        not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.EXPIRE)),
        not(isNull(creditTransaction.expirationDate)),
        isNull(creditTransaction.expirationDateProcessedAt),
        gt(creditTransaction.remainingAmount, 0)
      )
    );
  let expiredTotal = 0;
  for (const trx of transactions) {
    if (
      trx.expirationDate &&
      isAfter(now, trx.expirationDate) &&
      !trx.expirationDateProcessedAt
    ) {
      const remain = trx.remainingAmount ?? 0;
      if (remain > 0) {
        expiredTotal += remain;
        await db
          .update(creditTransaction)
          .set({
            remainingAmount: 0,
            expirationDateProcessedAt: now,
            updatedAt: now,
          })
          .where(eq(creditTransaction.id, trx.id));
      }
    }
  }
  if (expiredTotal > 0) {
    const current = await db
      .select()
      .from(userCredit)
      .where(eq(userCredit.userId, userId))
      .limit(1);
    const newBalance = Math.max(
      0,
      (current[0]?.currentCredits ?? 0) - expiredTotal
    );
    await db
      .update(userCredit)
      .set({ currentCredits: newBalance, updatedAt: now })
      .where(eq(userCredit.userId, userId));
    await saveCreditTransaction({
      userId,
      type: CREDIT_TRANSACTION_TYPE.EXPIRE,
      amount: -expiredTotal,
      description: `Expire credits: ${expiredTotal}`,
    });
  }
}

export async function canAddCreditsByType(userId: string, creditType: string) {
  const db = await getDb();
  const now = new Date();
  const existing = await db
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        eq(creditTransaction.type, creditType),
        sql`EXTRACT(MONTH FROM ${creditTransaction.createdAt}) = ${now.getMonth() + 1}`,
        sql`EXTRACT(YEAR FROM ${creditTransaction.createdAt}) = ${now.getFullYear()}`
      )
    )
    .limit(1);
  return existing.length === 0;
}

export async function addRegisterGiftCredits(userId: string) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.REGISTER_GIFT)
      )
    )
    .limit(1);
  if (existing.length > 0) return;
  const credits = websiteConfig.credits.registerGiftCredits.amount;
  const expireDays = websiteConfig.credits.registerGiftCredits.expireDays;
  await addCredits({
    userId,
    amount: credits,
    type: CREDIT_TRANSACTION_TYPE.REGISTER_GIFT,
    description: `Register gift credits: ${credits}`,
    expireDays,
  });
}

export async function addMonthlyFreeCredits(userId: string, planId: string) {
  const pricePlan = findPlanByPlanId(planId);
  if (
    !pricePlan ||
    pricePlan.disabled ||
    !pricePlan.isFree ||
    !pricePlan.credits?.enable
  ) {
    return;
  }
  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH
  );
  if (!canAdd) return;
  const credits = pricePlan.credits.amount ?? 0;
  const expireDays = pricePlan.credits.expireDays;
  await addCredits({
    userId,
    amount: credits,
    type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
    description: `Free monthly credits: ${credits}`,
    expireDays,
  });
}

export async function addSubscriptionCredits(userId: string, priceId: string) {
  const plan = findPlanByPriceId(priceId);
  if (!plan?.credits?.enable) {
    return;
  }
  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL
  );
  if (!canAdd) return;
  await addCredits({
    userId,
    amount: plan.credits.amount,
    type: CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
    description: `Subscription renewal credits: ${plan.credits.amount}`,
    expireDays: plan.credits.expireDays,
  });
}

export async function addLifetimeMonthlyCredits(
  userId: string,
  priceId: string
) {
  const plan = findPlanByPriceId(priceId);
  if (!plan?.isLifetime || plan.disabled || !plan.credits?.enable) {
    return;
  }
  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY
  );
  if (!canAdd) return;
  await addCredits({
    userId,
    amount: plan.credits.amount,
    type: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
    description: `Lifetime monthly credits: ${plan.credits.amount}`,
    expireDays: plan.credits.expireDays,
  });
}

export class CreditLedgerService implements CreditsGateway {
  async addCredits(payload: AddCreditsPayload): Promise<void> {
    await addCredits(payload);
  }

  async addSubscriptionCredits(userId: string, priceId: string): Promise<void> {
    await addSubscriptionCredits(userId, priceId);
  }

  async addLifetimeMonthlyCredits(
    userId: string,
    priceId: string
  ): Promise<void> {
    await addLifetimeMonthlyCredits(userId, priceId);
  }
}
