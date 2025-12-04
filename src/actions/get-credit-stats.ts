'use server';

import { getUserExpiringCreditsAmount } from '@/credits/services/credit-stats-service';
import { getUserFromCtx, userActionClient, withActionErrorBoundary } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';

const logger = getLogger({ span: 'actions.get-credit-stats' });

/**
 * Get credit statistics for a user
 */
export const getCreditStatsAction = userActionClient.action(
  withActionErrorBoundary(
    {
      logger,
      logMessage: 'get credit stats error',
      getLogContext: ({ ctx }) => {
        const currentUser = getUserFromCtx(ctx);
        return { userId: currentUser.id };
      },
      fallbackMessage: 'Failed to fetch credit statistics',
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    },
    async ({ ctx }) => {
      const currentUser = getUserFromCtx(ctx);
      const userId = currentUser.id;
      const totalExpiringCredits = await getUserExpiringCreditsAmount(userId);

      return {
        success: true,
        data: {
          expiringCredits: {
            amount: totalExpiringCredits,
          },
        },
      };
    }
  )
);
