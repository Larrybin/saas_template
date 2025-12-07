'use server';

import { z } from 'zod';
import {
  getUserFromCtx,
  userActionClient,
  withActionErrorBoundary,
} from '@/lib/safe-action';
import { getBillingService } from '@/lib/server/billing-service';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';
import { buildSubscriptionCheckoutParams } from './checkout-params';

const logger = getLogger({ span: 'actions.create-checkout-session' });

// Checkout schema for validation
// metadata is optional, and may contain referral information if you need
const checkoutSchema = z.object({
  userId: z.string().min(1, { error: 'User ID is required' }),
  planId: z.string().min(1, { error: 'Plan ID is required' }),
  priceId: z.string().min(1, { error: 'Price ID is required' }),
  metadata: z.record(z.string(), z.string()).optional(),
});

/**
 * Create a checkout session for a price plan
 */
export const createCheckoutAction = userActionClient
  .schema(checkoutSchema)
  .action(
    withActionErrorBoundary(
      {
        logger,
        logMessage: 'create checkout session error',
        getLogContext: ({ ctx, parsedInput }) => {
          const { planId, priceId } = parsedInput as {
            planId: string;
            priceId: string;
          };
          const currentUser = getUserFromCtx(ctx);
          return { userId: currentUser.id, planId, priceId };
        },
        fallbackMessage: 'Failed to create checkout session',
        code: ErrorCodes.UnexpectedError,
        retryable: true,
      },
      async ({ parsedInput, ctx }) => {
        const { planId, priceId, metadata } = parsedInput;
        const currentUser = getUserFromCtx(ctx);
        const params = await buildSubscriptionCheckoutParams({
          planId,
          priceId,
          metadata,
          customerEmail: currentUser.email,
          userId: currentUser.id,
          userName: currentUser.name,
          fallbackName: currentUser.email,
        });

        const billingService = getBillingService();
        const result = await billingService.startSubscriptionCheckout(params);
        return {
          success: true,
          data: result,
        };
      }
    )
  );
