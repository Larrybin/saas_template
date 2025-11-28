'use server';

import { z } from 'zod';
import { consumeCredits } from '@/credits/credits';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { userActionClient } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';

const logger = getLogger({ span: 'actions.consume-credits' });

// consume credits schema
const consumeSchema = z.object({
  amount: z.number().min(1),
  description: z.string().optional(),
});

/**
 * Consume credits
 */
export const consumeCreditsAction = userActionClient
  .schema(consumeSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { amount, description } = parsedInput;
    const currentUser = (ctx as { user: User }).user;

    try {
      await consumeCredits({
        userId: currentUser.id,
        amount,
        description: description || `Consume credits: ${amount}`,
      });
      return { success: true };
    } catch (error) {
      logger.error(
        { error, userId: currentUser.id, amount },
        'consume credits error'
      );
      if (error instanceof DomainError) {
        throw error;
      }
      throw new DomainError({
        code: ErrorCodes.UnexpectedError,
        message:
          error instanceof Error ? error.message : 'Failed to consume credits',
        retryable: true,
      });
    }
  });
