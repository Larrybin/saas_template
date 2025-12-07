'use server';

import { z } from 'zod';
import {
  type AccessCapability,
  getUserAccessCapabilities,
} from '@/lib/auth-domain';
import { DomainError } from '@/lib/domain-errors';
import {
  getUserFromCtx,
  userActionClient,
  withActionErrorBoundary,
} from '@/lib/safe-action';
import { getBillingService } from '@/lib/server/billing-service';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';
import { createCreditCheckout } from '@/payment';
import type { CheckoutResult } from '@/payment/types';
import {
  buildCreditCheckoutParams,
  buildSubscriptionCheckoutParams,
} from './checkout-params';

const logger = getLogger({ span: 'actions.ensure-access-and-checkout' });

const ensureAccessAndCheckoutSchema = z.object({
  mode: z.enum(['subscription', 'credits']),
  capability: z.string().min(1, { error: 'Capability is required' }),
  planId: z.string().min(1, { error: 'Plan ID is required' }).optional(),
  priceId: z.string().min(1, { error: 'Price ID is required' }).optional(),
  packageId: z.string().min(1, { error: 'Package ID is required' }).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

type EnsureAccessAndCheckoutInput = z.infer<
  typeof ensureAccessAndCheckoutSchema
>;

type EnsureAccessAndCheckoutResult = {
  success: true;
  data: {
    alreadyHasAccess: boolean;
    checkoutUrl?: string;
    checkoutId?: string;
  };
};

export const ensureAccessAndMaybeStartCheckout = async ({
  input,
  userId,
  customerEmail,
  userName,
}: {
  input: EnsureAccessAndCheckoutInput;
  userId: string;
  customerEmail: string;
  userName?: string | null;
}): Promise<EnsureAccessAndCheckoutResult> => {
  const capabilities = await getUserAccessCapabilities(userId, {
    externalCapabilities: [input.capability as AccessCapability],
  });
  const hasAccess = capabilities.includes(input.capability as AccessCapability);

  if (hasAccess) {
    logger.info(
      { userId, capability: input.capability },
      'User already has requested access capability; skipping checkout'
    );
    return {
      success: true,
      data: {
        alreadyHasAccess: true,
      },
    };
  }

  let checkout: CheckoutResult;

  if (input.mode === 'subscription') {
    if (!input.planId || !input.priceId) {
      throw new DomainError({
        code: ErrorCodes.UnexpectedError,
        message: 'Plan ID and Price ID are required for subscription checkout',
        retryable: false,
      });
    }

    const params = await buildSubscriptionCheckoutParams({
      planId: input.planId,
      priceId: input.priceId,
      metadata: input.metadata,
      customerEmail,
      userId,
      userName: userName ?? null,
      fallbackName: customerEmail,
    });

    const billingService = getBillingService();
    checkout = await billingService.startSubscriptionCheckout(params);
  } else {
    if (!input.packageId || !input.priceId) {
      throw new DomainError({
        code: ErrorCodes.UnexpectedError,
        message: 'Package ID and Price ID are required for credit checkout',
        retryable: false,
      });
    }

    const params = await buildCreditCheckoutParams({
      packageId: input.packageId,
      priceId: input.priceId,
      metadata: input.metadata,
      customerEmail,
      userId,
      userName: userName ?? null,
      fallbackName: customerEmail,
    });

    checkout = await createCreditCheckout(params);
  }

  return {
    success: true,
    data: {
      alreadyHasAccess: false,
      checkoutUrl: checkout.url,
      checkoutId: checkout.id,
    },
  };
};

export const ensureAccessAndCheckoutAction = userActionClient
  .schema(ensureAccessAndCheckoutSchema)
  .action(
    withActionErrorBoundary(
      {
        logger,
        logMessage: 'ensure access and checkout error',
        getLogContext: ({ ctx, parsedInput }) => {
          const currentUser = getUserFromCtx(ctx);
          const { capability, mode } =
            parsedInput as EnsureAccessAndCheckoutInput;
          return {
            userId: currentUser.id,
            capability,
            mode,
          };
        },
        fallbackMessage: 'Failed to ensure access and start checkout',
        code: ErrorCodes.UnexpectedError,
        retryable: true,
      },
      async ({ parsedInput, ctx }) => {
        const currentUser = getUserFromCtx(ctx);
        const result = await ensureAccessAndMaybeStartCheckout({
          input: parsedInput as EnsureAccessAndCheckoutInput,
          userId: currentUser.id,
          customerEmail: currentUser.email,
          userName: currentUser.name,
        });

        return result;
      }
    )
  );
