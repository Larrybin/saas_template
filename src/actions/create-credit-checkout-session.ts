'use server';

import { websiteConfig } from '@/config/website';
import { getCreditPackageById } from '@/credits/server';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';
import { getUrlWithLocale } from '@/lib/urls/urls';
import { createCreditCheckout } from '@/payment';
import type { CreateCreditCheckoutParams } from '@/payment/types';
import { Routes } from '@/routes';
import { getLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

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
  .action(async ({ parsedInput, ctx }) => {
    const { packageId, priceId, metadata } = parsedInput;
    const currentUser = (ctx as { user: User }).user;

    try {
      // Get the current locale from the request
      const locale = await getLocale();

      // Find the credit package
      const creditPackage = getCreditPackageById(packageId);
      if (!creditPackage) {
        return {
          success: false,
          error: 'Credit package not found',
        };
      }

      // Add metadata to identify this as a credit purchase
      const customMetadata: Record<string, string> = {
        ...metadata,
        type: 'credit_purchase',
        packageId,
        credits: creditPackage.amount.toString(),
        userId: currentUser.id,
        userName: currentUser.name,
      };

      // https://datafa.st/docs/stripe-checkout-api
      // if datafast analytics is enabled, add the revenue attribution to the metadata
      if (websiteConfig.features.enableDatafastRevenueTrack) {
        const cookieStore = await cookies();
        customMetadata.datafast_visitor_id =
          cookieStore.get('datafast_visitor_id')?.value ?? '';
        customMetadata.datafast_session_id =
          cookieStore.get('datafast_session_id')?.value ?? '';
      }

      // Create checkout session with credit-specific URLs
      const successUrl = getUrlWithLocale(
        `${Routes.SettingsCredits}?credits_session_id={CHECKOUT_SESSION_ID}`,
        locale
      );
      const cancelUrl = getUrlWithLocale(Routes.SettingsCredits, locale);

      const params: CreateCreditCheckoutParams = {
        packageId,
        priceId,
        customerEmail: currentUser.email,
        metadata: customMetadata,
        successUrl,
        cancelUrl,
        locale,
      };

      const result = await createCreditCheckout(params);
      // console.log('create credit checkout session result:', result);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('Create credit checkout session error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create checkout session',
      };
    }
  });
