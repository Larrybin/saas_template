import { randomUUID } from "crypto";
import { addDays } from "date-fns";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { creditTransaction } from "@/db/schema";
import { getLogger } from "@/lib/server/logger";
import type {
	CreditTransactionInsert,
	ICreditLedgerRepository,
} from "../data-access/credit-ledger-repository.interface";
import type { DbExecutor, Transaction } from "../data-access/types";
import type { AddCreditsPayload } from "../services/credits-gateway";
import { CREDIT_TRANSACTION_TYPE } from "../types";

export type ConsumeCreditsPayload = {
	userId: string;
	amount: number;
	description: string;
};

export class CreditLedgerDomainService {
	private readonly logger = getLogger({ span: "credits.ledger.domain" });

	constructor(
		private readonly repository: ICreditLedgerRepository,
		private readonly dbProvider: () => Promise<DbExecutor> = getDb,
	) {}

	private async resolveExecutor(db?: DbExecutor) {
		return db ?? (await this.dbProvider());
	}

	private isTransaction(executor: DbExecutor): executor is Transaction {
		return typeof (executor as Transaction).rollback === "function";
	}

	private validateAddCreditsPayload(payload: AddCreditsPayload) {
		const { userId, amount, type, description, expireDays } = payload;
		if (!userId || !type || !description) {
			throw new Error("Invalid params");
		}
		if (!Number.isFinite(amount) || amount <= 0) {
			throw new Error("Invalid amount");
		}
		if (
			expireDays !== undefined &&
			expireDays !== null &&
			(!Number.isFinite(expireDays) || expireDays < 0)
		) {
			throw new Error("Invalid expire days");
		}

		const isPeriodicType =
			type === CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH ||
			type === CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL ||
			type === CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY;

		if (isPeriodicType) {
			if (
				!Number.isFinite(payload.periodKey) ||
				(payload.periodKey ?? 0) <= 0
			) {
				throw new Error(
					"periodKey is required for periodic credit transactions",
				);
			}
		} else if (
			payload.periodKey !== undefined &&
			payload.periodKey !== null &&
			payload.periodKey > 0
		) {
			throw new Error(
				"periodKey should not be set for non-periodic credit transactions",
			);
		}
	}

	private async saveCreditTransaction(
		values: Omit<CreditTransactionInsert, "id" | "createdAt" | "updatedAt">,
		db: DbExecutor,
		timestamp: Date,
	) {
		await this.repository.insertTransaction(
			{
				id: randomUUID(),
				createdAt: timestamp,
				updatedAt: timestamp,
				...values,
			},
			db,
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
		db?: DbExecutor,
	): Promise<void> {
		const executor = await this.resolveExecutor(db);
		await this.repository.updateUserCredits(userId, credits, executor);
	}

	async addCredits(payload: AddCreditsPayload, db?: DbExecutor) {
		this.validateAddCreditsPayload(payload);
		const executor = await this.resolveExecutor(db);
		const now = new Date();
		const periodKey =
			typeof payload.periodKey === "number" && payload.periodKey > 0
				? payload.periodKey
				: 0;
		const current = await this.repository.findUserCredit(
			payload.userId,
			executor,
		);
		const newBalance = (current?.currentCredits ?? 0) + payload.amount;
		await this.repository.upsertUserCredit(
			payload.userId,
			newBalance,
			executor,
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
			now,
		);
	}

	async hasEnoughCredits(
		userId: string,
		requiredCredits: number,
		db?: DbExecutor,
	): Promise<boolean> {
		const balance = await this.getUserCredits(userId, db);
		return balance >= requiredCredits;
	}

	private async consumeCreditsWithExecutor(
		payload: ConsumeCreditsPayload,
		executor: DbExecutor,
	) {
		const balanceRecord = await this.repository.findUserCredit(
			payload.userId,
			executor,
		);
		const currentBalance = balanceRecord?.currentCredits ?? 0;
		if (currentBalance < payload.amount) {
			throw new Error("Insufficient credits");
		}

		const transactions = await this.repository.findFifoEligibleTransactions(
			payload.userId,
			executor,
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
				executor,
			);
			remainingToDeduct -= deductFromThis;
		}
		if (remainingToDeduct > 0) {
			throw new Error("Insufficient credits");
		}

		const newBalance = currentBalance - payload.amount;
		await this.repository.updateUserCredits(
			payload.userId,
			newBalance,
			executor,
		);
		await this.repository.insertUsageRecord(
			{
				userId: payload.userId,
				amount: -payload.amount,
				description: payload.description,
			},
			executor,
		);
	}

	async consumeCredits(payload: ConsumeCreditsPayload, db?: DbExecutor) {
		if (!payload.userId || !payload.description) {
			throw new Error("Invalid params");
		}
		if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
			throw new Error("Invalid amount");
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

	async processExpiredCredits(
		userId: string,
		db?: DbExecutor,
	): Promise<number> {
		const executor = await this.resolveExecutor(db);
		const now = new Date();
		const transactions = await this.repository.findExpirableTransactions(
			userId,
			now,
			executor,
		);
		if (transactions.length === 0) return 0;

		let expiredTotal = 0;
		for (const trx of transactions) {
			const remain = trx.remainingAmount ?? 0;
			if (remain > 0) {
				expiredTotal += remain;
				await this.repository.markTransactionExpired(trx.id, now, executor);
			}
		}

		if (expiredTotal <= 0) return 0;

		const currentRecord = await this.repository.findUserCredit(
			userId,
			executor,
		);
		const newBalance = Math.max(
			0,
			(currentRecord?.currentCredits ?? 0) - expiredTotal,
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
			now,
		);

		return expiredTotal;
	}

	async processExpiredCreditsForUsers(
		userIds: string[],
		db?: DbExecutor,
	): Promise<{
		processedCount: number;
		errorCount: number;
		totalExpiredCredits: number;
	}> {
		/**
		 * Best-effort batch processing.
		 *
		 * Each user is processed independently on the provided executor.
		 * Failures for individual users are logged and counted, but do NOT
		 * rollback already processed users, even if a transactional executor
		 * is passed in by the caller.
		 */
		if (userIds.length === 0) {
			this.logger.info(
				"processExpiredCreditsForUsers, no users to process for expiration",
			);
			return { processedCount: 0, errorCount: 0, totalExpiredCredits: 0 };
		}

		const executor = await this.resolveExecutor(db);
		let processedCount = 0;
		let errorCount = 0;
		let totalExpiredCredits = 0;

		for (const userId of userIds) {
			try {
				const expiredCredits = await this.processExpiredCredits(
					userId,
					executor,
				);
				totalExpiredCredits += expiredCredits;
				processedCount += 1;
			} catch (error) {
				errorCount += 1;
				this.logger.error(
					{ error, userId },
					"processExpiredCreditsForUsers, failed to process user",
				);
			}
		}

		return { processedCount, errorCount, totalExpiredCredits };
	}

	async canAddCreditsByType(
		userId: string,
		creditType: string,
		periodKey: number,
		db?: DbExecutor,
	): Promise<boolean> {
		const executor = await this.resolveExecutor(db);
		if (!Number.isFinite(periodKey) || periodKey <= 0) {
			throw new Error(
				"periodKey is required when checking canAddCreditsByType",
			);
		}
		const existing = await executor
			.select()
			.from(creditTransaction)
			.where(
				and(
					eq(creditTransaction.userId, userId),
					eq(creditTransaction.type, creditType),
					eq(creditTransaction.periodKey, periodKey),
				),
			)
			.limit(1);
		return existing.length === 0;
	}

	async hasTransactionOfType(
		userId: string,
		creditType: string,
		db?: DbExecutor,
	): Promise<boolean> {
		const executor = await this.resolveExecutor(db);
		const existing = await executor
			.select()
			.from(creditTransaction)
			.where(
				and(
					eq(creditTransaction.userId, userId),
					eq(creditTransaction.type, creditType),
				),
			)
			.limit(1);
		return existing.length > 0;
	}
}
