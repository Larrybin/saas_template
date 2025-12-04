'use server';

import { z } from 'zod';
import {
  getUserFromCtx,
  userActionClient,
  withActionErrorBoundary,
} from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';
import { isSubscribed } from '@/newsletter';

const logger = getLogger({ span: 'actions.check-newsletter-status' });

// Newsletter schema for validation
const newsletterSchema = z.object({
  email: z.email({ error: 'Please enter a valid email address' }),
});

// Create a safe action to check if a user is subscribed to the newsletter
export const checkNewsletterStatusAction = userActionClient
  .schema(newsletterSchema)
  .action(
    withActionErrorBoundary(
      {
        logger,
        logMessage: 'check newsletter status error',
        getLogContext: ({ ctx }) => ({
          userId: getUserFromCtx(ctx).id,
        }),
        fallbackMessage: 'Failed to check newsletter status',
        code: ErrorCodes.NewsletterStatusFailed,
        retryable: true,
      },
      async ({ parsedInput: { email } }) => {
        const subscribed = await isSubscribed(email);

        return {
          success: true,
          subscribed,
        };
      }
    )
  );
