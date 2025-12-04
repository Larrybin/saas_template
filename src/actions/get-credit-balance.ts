'use server';

import { getUserCredits } from '@/credits/credits';
import { getUserFromCtx, userActionClient, withActionErrorBoundary } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';

const logger = getLogger({ span: 'actions.get-credit-balance' });

/**
 * Get current user's credits
 */
export const getCreditBalanceAction = userActionClient.action(
  withActionErrorBoundary(
    {
      logger,
      logMessage: 'get credit balance error',
      getLogContext: ({ ctx }) => ({
        userId: getUserFromCtx(ctx).id,
      }),
      fallbackMessage: 'Failed to fetch credit balance',
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    },
    async ({ ctx }) => {
      const currentUser = getUserFromCtx(ctx);
      const credits = await getUserCredits(currentUser.id);
      return { success: true, credits };
    }
  )
);
