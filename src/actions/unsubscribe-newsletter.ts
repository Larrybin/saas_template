'use server';

import { z } from 'zod';
import { DomainError } from '@/lib/domain-errors';
import { userActionClient, withActionErrorBoundary } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';
import { unsubscribe } from '@/newsletter';

const logger = getLogger({ span: 'actions.unsubscribe-newsletter' });

// Newsletter schema for validation
const newsletterSchema = z.object({
  email: z.email({ error: 'Please enter a valid email address' }),
});

// Create a safe action for newsletter unsubscription
export const unsubscribeNewsletterAction = userActionClient
  .schema(newsletterSchema)
  .action(
    withActionErrorBoundary(
      {
        logger,
        logMessage: 'unsubscribe newsletter error',
        getLogContext: ({ parsedInput: { email } }) => ({ email }),
        fallbackMessage: 'Failed to unsubscribe from the newsletter',
        code: ErrorCodes.NewsletterUnsubscribeFailed,
        retryable: true,
      },
      async ({ parsedInput: { email } }) => {
        const unsubscribed = await unsubscribe(email);

        if (!unsubscribed) {
          logger.warn({ email }, 'unsubscribe newsletter error');
          throw new DomainError({
            code: ErrorCodes.NewsletterUnsubscribeFailed,
            message: 'Failed to unsubscribe from the newsletter',
            retryable: true,
          });
        }

        return {
          success: true,
        };
      }
    )
  );
