'use server';

import { getActiveSubscriptionInputSchema } from '@/actions/schemas';
import { serverEnv } from '@/env/server';
import { getUserFromCtx, userActionClient, withActionErrorBoundary } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
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
  .action(
    withActionErrorBoundary(
      {
        logger,
        logMessage: 'get user subscription data error',
        getLogContext: ({ ctx }) => ({
          userId: getUserFromCtx(ctx).id,
        }),
        fallbackMessage: 'Failed to fetch subscription data',
        code: ErrorCodes.SubscriptionFetchFailed,
        retryable: true,
      },
      async ({ ctx }) => {
        const currentUser = getUserFromCtx(ctx);

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

        // Find the user's most recent active subscription
        const subscriptions = await getSubscriptions({
          userId: currentUser.id,
        });

        let subscriptionData = null;
        if (subscriptions && subscriptions.length > 0) {
          const activeSubscription = subscriptions.find(
            (sub) => sub.status === 'active' || sub.status === 'trialing'
          );

          if (activeSubscription) {
            logger.info(
              { userId: currentUser.id },
              'Active subscription found'
            );
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
      }
    )
  );
