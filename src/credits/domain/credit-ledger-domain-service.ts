import { randomUUID } from 'crypto';
import { addDays } from 'date-fns';
import { and, eq, sql } from 'drizzle-orm';
import { featureFlags } from '@/config/feature-flags';
import { getDb } from '@/db';
import { creditTransaction } from '@/db/schema';
import type {
  CreditTransactionInsert,
  ICreditLedgerRepository,
} from '../data-access/credit-ledger-repository.interface';
import type { DbExecutor, Transaction } from '../data-access/types';
import type { AddCreditsPayload } from '../services/credits-gateway';
import { CREDIT_TRANSACTION_TYPE } from '../types';

export type ConsumeCreditsPayload = {
  userId: string;
  amount: number;
  description: string;
};

export class CreditLedgerDomainService {
  constructor(
    private readonly repository: ICreditLedgerRepository,
    private readonly dbProvider: () => Promise<DbExecutor> = getDb
  ) {}

  private async resolveExecutor(db?: DbExecutor) {
    return db ?? (await this.dbProvider());
  }

  private isTransaction(executor: DbExecutor): executor is Transaction {
    return typeof (executor as Transaction).rollback === 'function';
  }

  private validateAddCreditsPayload(payload: AddCreditsPayload) {
    const { userId, amount, type, description, expireDays } = payload;
    if (!userId || !type || !description) {
      throw new Error('Invalid params');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Invalid amount');
    }
    if (
      expireDays !== undefined &&
      expireDays !== null &&
      (!Number.isFinite(expireDays) || expireDays < 0)
    ) {
      throw new Error('Invalid expire days');
    }
  }

  private async saveCreditTransaction(
    values: Omit<CreditTransactionInsert, 'id' | 'createdAt' | 'updatedAt'>,
    db: DbExecutor,
    timestamp: Date
  ) {
    await this.repository.insertTransaction(
      {
        id: randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp,
        ...values,
      },
      db
    );
  }

  async getUserCredits(userId: string, db?: DbExecutor): Promise<number> {
    const executor = await this.resolveExecutor(db);
    const record = await this.repository.findUserCredit(userId, executor);
    return record?.currentCredits ?? 0;
  }

  async updateUserCredits(
    userId: string,
    credits: number,
    db?: DbExecutor
  ): Promise<void> {
    const executor = await this.resolveExecutor(db);
    await this.repository.updateUserCredits(userId, credits, executor);
  }

  async addCredits(payload: AddCreditsPayload, db?: DbExecutor) {
    this.validateAddCreditsPayload(payload);
    const executor = await this.resolveExecutor(db);
    const now = new Date();
    const periodKey =
      featureFlags.enableCreditPeriodKey &&
      typeof payload.periodKey === 'number' &&
      payload.periodKey > 0
        ? payload.periodKey
        : 0;
    const current = await this.repository.findUserCredit(
      payload.userId,
      executor
    );
    const newBalance = (current?.currentCredits ?? 0) + payload.amount;
    await this.repository.upsertUserCredit(
      payload.userId,
      newBalance,
      executor
    );

    const expirationDate =
      payload.expireDays && payload.expireDays > 0
        ? addDays(now, payload.expireDays)
        : undefined;

    await this.saveCreditTransaction(
      {
        userId: payload.userId,
        type: payload.type,
        amount: payload.amount,
        remainingAmount: payload.amount,
        description: payload.description,
        paymentId: payload.paymentId,
        expirationDate,
        periodKey,
      },
      executor,
      now
    );
  }

  async hasEnoughCredits(
    userId: string,
    requiredCredits: number,
    db?: DbExecutor
  ): Promise<boolean> {
    const balance = await this.getUserCredits(userId, db);
    return balance >= requiredCredits;
  }

  private async consumeCreditsWithExecutor(
    payload: ConsumeCreditsPayload,
    executor: DbExecutor
  ) {
    const balanceRecord = await this.repository.findUserCredit(
      payload.userId,
      executor
    );
    const currentBalance = balanceRecord?.currentCredits ?? 0;
    if (currentBalance < payload.amount) {
      throw new Error('Insufficient credits');
    }

    const transactions = await this.repository.findFifoEligibleTransactions(
      payload.userId,
      executor
    );

    let remainingToDeduct = payload.amount;
    for (const trx of transactions) {
      if (remainingToDeduct <= 0) break;
      const remainingAmount = trx.remainingAmount ?? 0;
      if (remainingAmount <= 0) continue;
      const deductFromThis = Math.min(remainingAmount, remainingToDeduct);
      await this.repository.updateTransactionRemainingAmount(
        trx.id,
        remainingAmount - deductFromThis,
        executor
      );
      remainingToDeduct -= deductFromThis;
    }
    if (remainingToDeduct > 0) {
      throw new Error('Insufficient credits');
    }

    const newBalance = currentBalance - payload.amount;
    await this.repository.updateUserCredits(
      payload.userId,
      newBalance,
      executor
    );
    await this.repository.insertUsageRecord(
      {
        userId: payload.userId,
        amount: -payload.amount,
        description: payload.description,
      },
      executor
    );
  }

  async consumeCredits(payload: ConsumeCreditsPayload, db?: DbExecutor) {
    if (!payload.userId || !payload.description) {
      throw new Error('Invalid params');
    }
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      throw new Error('Invalid amount');
    }
    const executor = await this.resolveExecutor(db);
    if (this.isTransaction(executor)) {
      await this.consumeCreditsWithExecutor(payload, executor);
      return;
    }

    await executor.transaction(async (tx) => {
      await this.consumeCreditsWithExecutor(payload, tx);
    });
  }

  async processExpiredCredits(userId: string, db?: DbExecutor) {
    const executor = await this.resolveExecutor(db);
    const now = new Date();
    const transactions = await this.repository.findExpirableTransactions(
      userId,
      now,
      executor
    );
    if (transactions.length === 0) return;

    let expiredTotal = 0;
    for (const trx of transactions) {
      const remain = trx.remainingAmount ?? 0;
      if (remain > 0) {
        expiredTotal += remain;
        await this.repository.markTransactionExpired(trx.id, now, executor);
      }
    }

    if (expiredTotal <= 0) return;

    const currentRecord = await this.repository.findUserCredit(
      userId,
      executor
    );
    const newBalance = Math.max(
      0,
      (currentRecord?.currentCredits ?? 0) - expiredTotal
    );
    await this.repository.updateUserCredits(userId, newBalance, executor);
    await this.saveCreditTransaction(
      {
        userId,
        type: CREDIT_TRANSACTION_TYPE.EXPIRE,
        amount: -expiredTotal,
        remainingAmount: null,
        description: `Expire credits: ${expiredTotal}`,
      },
      executor,
      now
    );
  }

  async canAddCreditsByType(
    userId: string,
    creditType: string,
    db?: DbExecutor,
    periodKey?: number
  ): Promise<boolean> {
    const executor = await this.resolveExecutor(db);
    const now = new Date();
    if (
      featureFlags.enableCreditPeriodKey &&
      periodKey &&
      Number.isFinite(periodKey) &&
      periodKey > 0
    ) {
      const existing = await executor
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
      return existing.length === 0;
    }
    const existing = await executor
      .select()
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.userId, userId),
          eq(creditTransaction.type, creditType),
          sql`EXTRACT(MONTH FROM ${creditTransaction.createdAt}) = ${
            now.getMonth() + 1
          }`,
          sql`EXTRACT(YEAR FROM ${creditTransaction.createdAt}) = ${now.getFullYear()}`
        )
      )
      .limit(1);
    return existing.length === 0;
  }

  async hasTransactionOfType(
    userId: string,
    creditType: string,
    db?: DbExecutor
  ): Promise<boolean> {
    const executor = await this.resolveExecutor(db);
    const existing = await executor
      .select()
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.userId, userId),
          eq(creditTransaction.type, creditType)
        )
      )
      .limit(1);
    return existing.length > 0;
  }
}
