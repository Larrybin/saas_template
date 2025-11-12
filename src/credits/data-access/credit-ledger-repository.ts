import { randomUUID } from 'crypto';
import { and, asc, eq, gt, isNull, not, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { creditTransaction, userCredit } from '@/db/schema';
import { CREDIT_TRANSACTION_TYPE } from '../types';

type DrizzleDb = Awaited<ReturnType<typeof getDb>>;
type TransactionCallback = Parameters<DrizzleDb['transaction']>[0];
type Transaction = Parameters<TransactionCallback>[0];

export type DbExecutor = DrizzleDb | Transaction;

export type UserCreditRecord = typeof userCredit.$inferSelect;

export class CreditLedgerRepository {
  private async executor(db?: DbExecutor) {
    return db ?? (await getDb());
  }

  async findUserCredit(
    userId: string,
    db?: DbExecutor
  ): Promise<UserCreditRecord | undefined> {
    const client = await this.executor(db);
    const result = await client
      .select()
      .from(userCredit)
      .where(eq(userCredit.userId, userId))
      .limit(1);
    return result[0];
  }

  async upsertUserCredit(
    userId: string,
    credits: number,
    db?: DbExecutor
  ): Promise<void> {
    const client = await this.executor(db);
    const existing = await this.findUserCredit(userId, client);
    if (existing) {
      await client
        .update(userCredit)
        .set({ currentCredits: credits, updatedAt: new Date() })
        .where(eq(userCredit.userId, userId));
      return;
    }

    await client.insert(userCredit).values({
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
    db?: DbExecutor
  ): Promise<void> {
    const client = await this.executor(db);
    await client
      .update(userCredit)
      .set({ currentCredits: credits, updatedAt: new Date() })
      .where(eq(userCredit.userId, userId));
  }

  async insertTransaction(
    values: typeof creditTransaction.$inferInsert,
    db?: DbExecutor
  ): Promise<void> {
    const client = await this.executor(db);
    await client.insert(creditTransaction).values(values);
  }

  async findFifoEligibleTransactions(userId: string, db?: DbExecutor) {
    const client = await this.executor(db);
    return client
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
    db?: DbExecutor
  ) {
    const client = await this.executor(db);
    await client
      .update(creditTransaction)
      .set({ remainingAmount, updatedAt: new Date() })
      .where(eq(creditTransaction.id, id));
  }

  async insertUsageRecord(
    payload: { userId: string; amount: number; description: string },
    db?: DbExecutor
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
}
