import { and, eq, gt, isNull, lt, not } from 'drizzle-orm';
import { getDb } from '@/db';
import { creditTransaction } from '@/db/schema';
import { getLogger } from '@/lib/server/logger';
import { CreditLedgerRepository } from './data-access/credit-ledger-repository';
import type { DbExecutor } from './data-access/types';
import { CreditLedgerDomainService } from './domain/credit-ledger-domain-service';
import { CREDIT_TRANSACTION_TYPE } from './types';

const baseLogger = getLogger({ span: 'credits.expiry.job' });
const creditLedgerDomainService = new CreditLedgerDomainService(
  new CreditLedgerRepository()
);

export type ExpirationJobResult = {
  usersCount: number;
  processedCount: number;
  errorCount: number;
  totalExpiredCredits: number;
  batchCount: number;
};

export async function runExpirationJob(options?: {
  batchSize?: number;
}): Promise<ExpirationJobResult> {
  const db = await getDb();
  const now = new Date();
  const rawBatchSize = options?.batchSize ?? 100;
  const batchSize = rawBatchSize > 0 ? rawBatchSize : 100;

  baseLogger.info(
    {
      batchSize,
    },
    '>>> expiration job start'
  );

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

  const usersCount = usersWithExpirableCredits.length;
  let processedCount = 0;
  let errorCount = 0;
  let totalExpiredCredits = 0;
  let batchCount = 0;

  if (usersCount === 0) {
    baseLogger.info(
      {
        usersCount,
        batchSize,
      },
      'runExpirationJob, no users to process'
    );
    return {
      usersCount,
      processedCount: 0,
      errorCount: 0,
      totalExpiredCredits: 0,
      batchCount: 0,
    };
  }

  baseLogger.info(
    {
      usersCount,
    },
    'runExpirationJob, users with expirable credits'
  );

  for (let i = 0; i < usersWithExpirableCredits.length; i += batchSize) {
    const batchUserIds = usersWithExpirableCredits
      .slice(i, i + batchSize)
      .map((user) => user.userId);

    if (batchUserIds.length === 0) continue;

    try {
      await db.transaction(async (tx) => {
        const batchResult =
          await creditLedgerDomainService.processExpiredCreditsForUsers(
            batchUserIds,
            tx as DbExecutor
          );
        processedCount += batchResult.processedCount;
        errorCount += batchResult.errorCount;
        totalExpiredCredits += batchResult.totalExpiredCredits;
      });
      batchCount += 1;
    } catch (error) {
      const batchNumber = i / batchSize + 1;
      baseLogger.error(
        { batchNumber, error },
        'runExpirationJob, transaction failed for batch'
      );
      errorCount += batchUserIds.length;
    }

    if (usersWithExpirableCredits.length > 1000) {
      baseLogger.info(
        {
          processed: Math.min(i + batchSize, usersWithExpirableCredits.length),
          total: usersWithExpirableCredits.length,
        },
        'runExpirationJob, progress'
      );
    }
  }

  baseLogger.info(
    {
      usersCount,
      processedCount,
      errorCount,
      totalExpiredCredits,
      batchCount,
    },
    '<<< expiration job end'
  );

  return { usersCount, processedCount, errorCount, totalExpiredCredits, batchCount };
}
