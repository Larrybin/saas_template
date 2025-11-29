'use server';

import { addDays } from 'date-fns';
import { and, eq, gt, gte, isNotNull, lte, sum } from 'drizzle-orm';
import { getDb } from '@/db';
import { creditTransaction } from '@/db/schema';
import type { User } from '@/lib/auth-types';
import { CREDITS_EXPIRATION_DAYS } from '@/lib/constants';
import { DomainError } from '@/lib/domain-errors';
import { userActionClient } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';

const logger = getLogger({ span: 'actions.get-credit-stats' });

/**
 * Get credit statistics for a user
 */
export const getCreditStatsAction = userActionClient.action(async ({ ctx }) => {
  const currentUser = (ctx as { user: User }).user;
  const userId = currentUser.id;
  try {
    const db = await getDb();
    const now = new Date();
    // Get credits expiring in the next 30 days
    const expirationDaysFromNow = addDays(now, CREDITS_EXPIRATION_DAYS);

    // Get total credits expiring in the next 30 days
    const expiringCreditsResult = await db
      .select({
        totalAmount: sum(creditTransaction.remainingAmount),
      })
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.userId, userId),
          isNotNull(creditTransaction.expirationDate),
          isNotNull(creditTransaction.remainingAmount),
          gt(creditTransaction.remainingAmount, 0),
          lte(creditTransaction.expirationDate, expirationDaysFromNow),
          gte(creditTransaction.expirationDate, now)
        )
      );

    const totalExpiringCredits =
      Number(expiringCreditsResult[0]?.totalAmount) || 0;

    return {
      success: true,
      data: {
        expiringCredits: {
          amount: totalExpiringCredits,
        },
      },
    };
  } catch (error) {
    logger.error({ error, userId }, 'get credit stats error');
    if (error instanceof DomainError) {
      throw error;
    }
    throw new DomainError({
      code: ErrorCodes.UnexpectedError,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to fetch credit statistics',
      retryable: true,
    });
  }
});
