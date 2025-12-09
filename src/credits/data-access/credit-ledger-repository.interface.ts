import type { creditTransaction, userCredit } from '@/db/schema';
import type { DbExecutor } from './types';

export type UserCreditRecord = typeof userCredit.$inferSelect;
export type CreditTransactionRecord = typeof creditTransaction.$inferSelect;
export type CreditTransactionInsert = typeof creditTransaction.$inferInsert;

export interface ICreditLedgerRepository {
  /**
   * Returns the current credit balance record for a user, if any.
   */
  findUserCredit(
    userId: string,
    db: DbExecutor
  ): Promise<UserCreditRecord | undefined>;

  /**
   * Atomically updates the aggregate credit balance for a user.
   *
   * The `credits` argument is treated as a delta (positive or negative),
   * not as the final absolute balance.
   */
  upsertUserCredit(
    userId: string,
    credits: number,
    db: DbExecutor
  ): Promise<void>;

  updateUserCredits(
    userId: string,
    credits: number,
    db: DbExecutor
  ): Promise<void>;

  insertTransaction(
    values: CreditTransactionInsert,
    db: DbExecutor
  ): Promise<void>;

  findFifoEligibleTransactions(
    userId: string,
    db: DbExecutor
  ): Promise<CreditTransactionRecord[]>;

  updateTransactionRemainingAmount(
    id: string,
    remainingAmount: number,
    db: DbExecutor
  ): Promise<void>;

  insertUsageRecord(
    payload: { userId: string; amount: number; description: string },
    db: DbExecutor
  ): Promise<void>;

  findExpirableTransactions(
    userId: string,
    now: Date,
    db: DbExecutor
  ): Promise<CreditTransactionRecord[]>;

  markTransactionExpired(id: string, now: Date, db: DbExecutor): Promise<void>;

  /**
   * Finds a single credit transaction for a user by type and period key.
   * Used to enforce idempotency for periodic credit grants.
   */
  findTransactionByTypeAndPeriodKey(
    userId: string,
    creditType: string,
    periodKey: number,
    db: DbExecutor
  ): Promise<CreditTransactionRecord | undefined>;

  /**
   * Finds the first credit transaction of a given type for a user, if any.
   * Used for one-off grants like register gift credits.
   */
  findFirstTransactionOfType(
    userId: string,
    creditType: string,
    db: DbExecutor
  ): Promise<CreditTransactionRecord | undefined>;
}
