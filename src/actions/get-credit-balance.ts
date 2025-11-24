'use server';

import { getUserCredits } from '@/credits/credits';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';
import { getLogger } from '@/lib/server/logger';

const logger = getLogger({ span: 'actions.get-credit-balance' });

/**
 * Get current user's credits
 */
export const getCreditBalanceAction = userActionClient.action(
  async ({ ctx }) => {
    try {
      const currentUser = (ctx as { user: User }).user;
      const credits = await getUserCredits(currentUser.id);
      return { success: true, credits };
    } catch (error) {
      logger.error({ error }, 'get credit balance error');
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch credit balance',
      };
    }
  }
);
