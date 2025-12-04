'use server';

import { getUserCredits } from '@/credits/credits';
import { getUserExpiringCreditsAmount } from '@/credits/services/credit-stats-service';
import {
  getUserFromCtx,
  userActionClient,
  withActionErrorBoundary,
} from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';

const logger = getLogger({ span: 'actions.get-credit-overview' });

/**
 * Get credit overview for current user, including:
 * - current balance
 * - total amount of credits that will expire in the configured window
 */
export const getCreditOverviewAction = userActionClient.action(
  withActionErrorBoundary(
    {
      logger,
      logMessage: 'get credit overview error',
      getLogContext: ({ ctx }) => ({
        userId: getUserFromCtx(ctx).id,
      }),
      fallbackMessage: 'Failed to fetch credit overview',
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    },
    async ({ ctx }) => {
      const currentUser = getUserFromCtx(ctx);
      const [balance, expiringAmount] = await Promise.all([
        getUserCredits(currentUser.id),
        getUserExpiringCreditsAmount(currentUser.id),
      ]);

      return {
        success: true,
        data: {
          balance,
          expiringCredits: {
            amount: expiringAmount,
          },
        },
      };
    }
  )
);
