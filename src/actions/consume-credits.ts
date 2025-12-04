'use server';

import { z } from 'zod';
import { consumeCredits } from '@/credits/credits';
import { getUserFromCtx, userActionClient, withActionErrorBoundary } from '@/lib/safe-action';
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
  .action(
    withActionErrorBoundary(
      {
        logger,
        logMessage: 'consume credits error',
        getLogContext: ({ ctx, parsedInput }) => ({
          userId: getUserFromCtx(ctx).id,
          amount: (parsedInput as { amount: number }).amount,
        }),
        fallbackMessage: 'Failed to consume credits',
        code: ErrorCodes.UnexpectedError,
        retryable: true,
      },
      async ({ parsedInput, ctx }) => {
        const { amount, description } = parsedInput;
        const currentUser = getUserFromCtx(ctx);

        await consumeCredits({
          userId: currentUser.id,
          amount,
          description: description || `Consume credits: ${amount}`,
        });
        return { success: true };
      }
    )
  );
