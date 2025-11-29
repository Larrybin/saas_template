'use server';

import { getUserExpiringCreditsAmount } from '@/credits/services/credit-stats-service';
import type { User } from '@/lib/auth-types';
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
    const totalExpiringCredits = await getUserExpiringCreditsAmount(userId);

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
