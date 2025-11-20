'use server';

import { eq } from 'drizzle-orm';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { user } from '@/db/schema';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';
import { getUrlWithLocale } from '@/lib/urls/urls';
import { createCustomerPortal } from '@/payment';
import type { CreatePortalParams } from '@/payment/types';

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
export const createPortalAction = userActionClient
  .schema(portalSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { returnUrl } = parsedInput;
    const currentUser = (ctx as { user: User }).user;

    try {
      // Get the user's customer ID from the database
      const db = await getDb();
      const customerResult = await db
        .select({ customerId: user.customerId })
        .from(user)
        .where(eq(user.id, currentUser.id))
        .limit(1);

      const customer = customerResult[0];
      if (!customer || !customer.customerId) {
        console.error(`No customer found for user ${currentUser.id}`);
        return {
          success: false,
          error: 'No customer found for user',
        };
      }

      // Get the current locale from the request
      const locale = (await getLocale()) ?? 'en';

      // Create the portal session with localized URL if no custom return URL is provided
      const returnUrlWithLocale =
        returnUrl || getUrlWithLocale('/settings/billing', locale);
      const customerId = customer.customerId;
      if (!customerId) {
        console.error(
          `No customer id found for user ${currentUser.id} after validation`
        );
        return {
          success: false,
          error: 'No customer id found for user',
        };
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
    } catch (error) {
      console.error('create customer portal error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
