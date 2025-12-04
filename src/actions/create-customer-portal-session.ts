'use server';

import { eq } from 'drizzle-orm';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { user } from '@/db/schema';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { userActionClient, withActionErrorBoundary } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';
import { getUrlWithLocale } from '@/lib/urls/urls';
import { createCustomerPortal } from '@/payment';
import type { CreatePortalParams } from '@/payment/types';

const logger = getLogger({ span: 'actions.create-customer-portal' });

// Portal schema for validation
const portalSchema = z.object({
  userId: z.string().min(1, { error: 'User ID is required' }),
  returnUrl: z
    .string()
    .url({ error: 'Return URL must be a valid URL' })
    .optional(),
});

/**
 * Create a customer portal session
 */
export const createPortalAction = userActionClient.schema(portalSchema).action(
  withActionErrorBoundary(
    {
      logger,
      logMessage: 'create customer portal error',
      getLogContext: ({ ctx }) => ({
        userId: (ctx as { user: User }).user.id,
      }),
      fallbackMessage: 'Failed to create customer portal session',
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    },
    async ({ parsedInput, ctx }) => {
      const { returnUrl } = parsedInput;
      const currentUser = (ctx as { user: User }).user;

      // Get the user's customer ID from the database
      const db = await getDb();
      const customerResult = await db
        .select({ customerId: user.customerId })
        .from(user)
        .where(eq(user.id, currentUser.id))
        .limit(1);

      const customer = customerResult[0];
      if (!customer || !customer.customerId) {
        logger.warn({ userId: currentUser.id }, 'No customer found for user');
        throw new DomainError({
          code: ErrorCodes.UnexpectedError,
          message: 'No customer found for user',
          retryable: false,
        });
      }

      // Get the current locale from the request
      const locale = (await getLocale()) ?? 'en';

      // Create the portal session with localized URL if no custom return URL is provided
      const returnUrlWithLocale =
        returnUrl || getUrlWithLocale('/settings/billing', locale);
      const customerId = customer.customerId;
      if (!customerId) {
        logger.warn(
          { userId: currentUser.id },
          'No customer id found for user after validation'
        );
        throw new DomainError({
          code: ErrorCodes.UnexpectedError,
          message: 'No customer id found for user',
          retryable: false,
        });
      }

      const params: CreatePortalParams = {
        customerId,
        returnUrl: returnUrlWithLocale,
        locale,
      };

      const result = await createCustomerPortal(params);
      // console.log('create customer portal result:', result);
      return {
        success: true,
        data: result,
      };
    }
  )
);
