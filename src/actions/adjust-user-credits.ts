'use server';

import { z } from 'zod';
import {
  adminActionClient,
  getUserFromCtx,
  withActionErrorBoundary,
} from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';
import { adjustUserCredits } from '@/lib/server/usecases/adjust-user-credits';

const logger = getLogger({ span: 'actions.admin.adjust-user-credits' });

const adjustUserCreditsSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
  direction: z.enum(['increase', 'decrease']),
  reason: z.string().min(1),
  correlationId: z.string().optional(),
});

export const adjustUserCreditsAction = adminActionClient
  .schema(adjustUserCreditsSchema)
  .action(
    withActionErrorBoundary(
      {
        logger,
        logMessage: 'adjust user credits error',
        getLogContext: ({ ctx, parsedInput }) => {
          const operator = getUserFromCtx(ctx);
          const { userId, amount, direction } = parsedInput as {
            userId: string;
            amount: number;
            direction: 'increase' | 'decrease';
          };
          return {
            operatorId: operator.id,
            targetUserId: userId,
            amount,
            direction,
          };
        },
        fallbackMessage: 'Failed to adjust user credits',
        code: ErrorCodes.UnexpectedError,
        retryable: true,
      },
      async ({ ctx, parsedInput }) => {
        const operator = getUserFromCtx(ctx);
        await adjustUserCredits({
          operatorId: operator.id,
          userId: parsedInput.userId,
          amount: parsedInput.amount,
          direction: parsedInput.direction,
          reason: parsedInput.reason,
          ...(parsedInput.correlationId
            ? { correlationId: parsedInput.correlationId }
            : {}),
        });
        return { success: true };
      }
    )
  );
