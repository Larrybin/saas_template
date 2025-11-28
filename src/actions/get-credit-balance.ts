'use server';

import { getUserCredits } from '@/credits/credits';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { userActionClient } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';

const logger = getLogger({ span: 'actions.get-credit-balance' });

/**
 * Get current user's credits
 */
export const getCreditBalanceAction = userActionClient.action(
  async ({ ctx }) => {
    const currentUser = (ctx as { user: User }).user;
    try {
      const credits = await getUserCredits(currentUser.id);
      return { success: true, credits };
    } catch (error) {
      logger.error(
        { error, userId: currentUser.id },
        'get credit balance error'
      );
      if (error instanceof DomainError) {
        throw error;
      }
      throw new DomainError({
        code: ErrorCodes.UnexpectedError,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch credit balance',
        retryable: true,
      });
    }
  }
);
