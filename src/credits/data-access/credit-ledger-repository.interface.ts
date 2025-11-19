import type { creditTransaction, userCredit } from "@/db/schema";
import type { DbExecutor } from "./types";

export type UserCreditRecord = typeof userCredit.$inferSelect;
export type CreditTransactionRecord = typeof creditTransaction.$inferSelect;
export type CreditTransactionInsert = typeof creditTransaction.$inferInsert;

export interface ICreditLedgerRepository {
	findUserCredit(
		userId: string,
		db: DbExecutor,
	): Promise<UserCreditRecord | undefined>;
	upsertUserCredit(
		userId: string,
		credits: number,
		db: DbExecutor,
	): Promise<void>;
	updateUserCredits(
		userId: string,
		credits: number,
		db: DbExecutor,
	): Promise<void>;
	insertTransaction(
		values: CreditTransactionInsert,
		db: DbExecutor,
	): Promise<void>;
	findFifoEligibleTransactions(
		userId: string,
		db: DbExecutor,
	): Promise<CreditTransactionRecord[]>;
	updateTransactionRemainingAmount(
		id: string,
		remainingAmount: number,
		db: DbExecutor,
	): Promise<void>;
	insertUsageRecord(
		payload: { userId: string; amount: number; description: string },
		db: DbExecutor,
	): Promise<void>;
	findExpirableTransactions(
		userId: string,
		now: Date,
		db: DbExecutor,
	): Promise<CreditTransactionRecord[]>;
	markTransactionExpired(id: string, now: Date, db: DbExecutor): Promise<void>;
}
