'use server';

import { getActiveSubscriptionInputSchema } from '@/actions/schemas';
import { serverEnv } from '@/env/server';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';
import { getLogger } from '@/lib/server/logger';
import { getSubscriptions } from '@/payment';

const logger = getLogger({ span: 'actions.get-active-subscription' });

/**
 * Get active subscription data
 *
 * If the user has multiple subscriptions,
 * it returns the most recent active or trialing one
 */
export const getActiveSubscriptionAction = userActionClient
  .schema(getActiveSubscriptionInputSchema)
  .action(async ({ ctx }) => {
    const currentUser = (ctx as { user: User }).user;

    // Check if Stripe environment variables are configured
    const stripeSecretKey = serverEnv.stripeSecretKey;
    const stripeWebhookSecret = serverEnv.stripeWebhookSecret;

    if (!stripeSecretKey || !stripeWebhookSecret) {
      logger.warn('Stripe environment variables not configured, return');
      return {
        success: true,
        data: null, // No subscription = free plan
      };
    }

    try {
      // Find the user's most recent active subscription
      const subscriptions = await getSubscriptions({
        userId: currentUser.id,
      });
      // console.log('get user subscriptions:', subscriptions);

      let subscriptionData = null;
      // Find the most recent active subscription (if any)
      if (subscriptions && subscriptions.length > 0) {
        // First try to find an active subscription
        const activeSubscription = subscriptions.find(
          (sub) => sub.status === 'active' || sub.status === 'trialing'
        );

        // If found, use it
        if (activeSubscription) {
          logger.info({ userId: currentUser.id }, 'Active subscription found');
          subscriptionData = activeSubscription;
        } else {
          logger.info(
            { userId: currentUser.id },
            'No active subscription found for user'
          );
        }
      } else {
        logger.info({ userId: currentUser.id }, 'No subscriptions found');
      }

      return {
        success: true,
        data: subscriptionData,
      };
    } catch (error) {
      logger.error({ error }, 'get user subscription data error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
