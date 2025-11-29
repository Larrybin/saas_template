'use server';

import { getUserCredits } from '@/credits/credits';
import { getUserExpiringCreditsAmount } from '@/credits/services/credit-stats-service';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { userActionClient } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';

const logger = getLogger({ span: 'actions.get-credit-overview' });

/**
 * Get credit overview for current user, including:
 * - current balance
 * - total amount of credits that will expire in the configured window
 */
export const getCreditOverviewAction = userActionClient.action(
  async ({ ctx }) => {
    const currentUser = (ctx as { user: User }).user;

    try {
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
    } catch (error) {
      logger.error(
        { error, userId: currentUser.id },
        'get credit overview error'
      );
      if (error instanceof DomainError) {
        throw error;
      }
      throw new DomainError({
        code: ErrorCodes.UnexpectedError,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch credit overview',
        retryable: true,
      });
    }
  }
);
