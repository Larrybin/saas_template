import { randomUUID } from 'crypto';
import { and, asc, eq, gt, isNull, lt, not, or, sql } from 'drizzle-orm';
import { creditTransaction, userCredit } from '@/db/schema';
import { CREDIT_TRANSACTION_TYPE } from '../types';
import type {
  CreditTransactionRecord,
  ICreditLedgerRepository,
  UserCreditRecord,
} from './credit-ledger-repository.interface';
import type { DbExecutor } from './types';

export class CreditLedgerRepository implements ICreditLedgerRepository {
  async findUserCredit(
    userId: string,
    db: DbExecutor
  ): Promise<UserCreditRecord | undefined> {
    const result = await db
      .select()
      .from(userCredit)
      .where(eq(userCredit.userId, userId))
      .limit(1);
    return result[0];
  }

  async upsertUserCredit(
    userId: string,
    credits: number,
    db: DbExecutor
  ): Promise<void> {
    const existing = await this.findUserCredit(userId, db);
    if (existing) {
      await db
        .update(userCredit)
        .set({ currentCredits: credits, updatedAt: new Date() })
        .where(eq(userCredit.userId, userId));
      return;
    }

    await db.insert(userCredit).values({
      id: randomUUID(),
      userId,
      currentCredits: credits,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateUserCredits(
    userId: string,
    credits: number,
    db: DbExecutor
  ): Promise<void> {
    await db
      .update(userCredit)
      .set({ currentCredits: credits, updatedAt: new Date() })
      .where(eq(userCredit.userId, userId));
  }

  async insertTransaction(
    values: typeof creditTransaction.$inferInsert,
    db: DbExecutor
  ): Promise<void> {
    await db.insert(creditTransaction).values(values);
  }

  async findFifoEligibleTransactions(
    userId: string,
    db: DbExecutor
  ): Promise<CreditTransactionRecord[]> {
    return db
      .select()
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.userId, userId),
          not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.USAGE)),
          not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.EXPIRE)),
          or(
            isNull(creditTransaction.expirationDate),
            gt(creditTransaction.expirationDate, new Date())
          ),
          gt(creditTransaction.remainingAmount, 0)
        )
      )
      .orderBy(
        asc(
          sql`CASE WHEN ${creditTransaction.expirationDate} IS NULL THEN 1 ELSE 0 END`
        ),
        asc(creditTransaction.expirationDate),
        asc(creditTransaction.createdAt)
      );
  }

  async updateTransactionRemainingAmount(
    id: string,
    remainingAmount: number,
    db: DbExecutor
  ) {
    await db
      .update(creditTransaction)
      .set({ remainingAmount, updatedAt: new Date() })
      .where(eq(creditTransaction.id, id));
  }

  async insertUsageRecord(
    payload: { userId: string; amount: number; description: string },
    db: DbExecutor
  ) {
    await this.insertTransaction(
      {
        id: randomUUID(),
        userId: payload.userId,
        type: CREDIT_TRANSACTION_TYPE.USAGE,
        amount: payload.amount,
        remainingAmount: null,
        description: payload.description,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      db
    );
  }

  async findExpirableTransactions(
    userId: string,
    now: Date,
    db: DbExecutor
  ): Promise<CreditTransactionRecord[]> {
    return db
      .select()
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.userId, userId),
          not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.USAGE)),
          not(eq(creditTransaction.type, CREDIT_TRANSACTION_TYPE.EXPIRE)),
          not(isNull(creditTransaction.expirationDate)),
          isNull(creditTransaction.expirationDateProcessedAt),
          gt(creditTransaction.remainingAmount, 0),
          lt(creditTransaction.expirationDate, now)
        )
      );
  }

  async markTransactionExpired(
    id: string,
    now: Date,
    db: DbExecutor
  ): Promise<void> {
    await db
      .update(creditTransaction)
      .set({
        remainingAmount: 0,
        expirationDateProcessedAt: now,
        updatedAt: now,
      })
      .where(eq(creditTransaction.id, id));
  }

  async findTransactionByTypeAndPeriodKey(
    userId: string,
    creditType: string,
    periodKey: number,
    db: DbExecutor
  ): Promise<CreditTransactionRecord | undefined> {
    const result = await db
      .select()
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.userId, userId),
          eq(creditTransaction.type, creditType),
          eq(creditTransaction.periodKey, periodKey)
        )
      )
      .limit(1);
    return result[0];
  }

  async findFirstTransactionOfType(
    userId: string,
    creditType: string,
    db: DbExecutor
  ): Promise<CreditTransactionRecord | undefined> {
    const result = await db
      .select()
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.userId, userId),
          eq(creditTransaction.type, creditType)
        )
      )
      .limit(1);
    return result[0];
  }
}
