'use server';

import { z } from 'zod';
import {
  getUserFromCtx,
  userActionClient,
  withActionErrorBoundary,
} from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';
import { createCreditCheckout } from '@/payment';
import { buildCreditCheckoutParams } from './checkout-params';

// Credit checkout schema for validation
// metadata is optional, and may contain referral information if you need
const creditCheckoutSchema = z.object({
  userId: z.string().min(1, { error: 'User ID is required' }),
  packageId: z.string().min(1, { error: 'Package ID is required' }),
  priceId: z.string().min(1, { error: 'Price ID is required' }),
  metadata: z.record(z.string(), z.string()).optional(),
});

/**
 * Create a checkout session for a credit package
 */
export const createCreditCheckoutSession = userActionClient
  .schema(creditCheckoutSchema)
  .action(
    withActionErrorBoundary(
      {
        logger: getLogger({ span: 'actions.create-credit-checkout-session' }),
        logMessage: 'create credit checkout session error',
        getLogContext: ({ ctx, parsedInput }) => {
          const { packageId, priceId } = parsedInput as {
            packageId: string;
            priceId: string;
          };
          const currentUser = getUserFromCtx(ctx);
          return { userId: currentUser.id, packageId, priceId };
        },
        fallbackMessage: 'Failed to create credit checkout session',
        code: ErrorCodes.UnexpectedError,
        retryable: true,
      },
      async ({ parsedInput, ctx }) => {
        const { packageId, priceId, metadata } = parsedInput;
        const currentUser = getUserFromCtx(ctx);
        const params = await buildCreditCheckoutParams({
          packageId,
          priceId,
          metadata,
          customerEmail: currentUser.email,
          userId: currentUser.id,
          userName: currentUser.name,
          fallbackName: currentUser.email,
        });

        const result = await createCreditCheckout(params);
        return {
          success: true,
          data: result,
        };
      }
    )
  );
