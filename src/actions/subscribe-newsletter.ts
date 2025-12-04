'use server';

import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { DomainError } from '@/lib/domain-errors';
import { actionClient, withActionErrorBoundary } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { createEmailLogFields, getLogger } from '@/lib/server/logger';
import { sendEmail } from '@/mail';
import { subscribe } from '@/newsletter';

const logger = getLogger({ span: 'actions.subscribe-newsletter' });

// Newsletter schema for validation
const newsletterSchema = z.object({
  email: z.email({ error: 'Please enter a valid email address' }),
});

// Create a safe action for newsletter subscription
export const subscribeNewsletterAction = actionClient
  .schema(newsletterSchema)
  .action(
    withActionErrorBoundary(
      {
        logger,
        logMessage: 'subscribe newsletter error',
        getLogContext: ({ parsedInput }) => {
          const email = (parsedInput as { email: string }).email;
          return createEmailLogFields(email);
        },
        fallbackMessage: 'Failed to subscribe to the newsletter',
        code: ErrorCodes.NewsletterSubscribeFailed,
        retryable: true,
      },
      async ({ parsedInput: { email } }) => {
        const emailLogFields = createEmailLogFields(email);
        // Do not check if the user is authenticated here
        const subscribed = await subscribe(email);

        if (!subscribed) {
          logger.warn(emailLogFields, 'subscribe newsletter error');
          throw new DomainError({
            code: ErrorCodes.NewsletterSubscribeFailed,
            message: 'Failed to subscribe to the newsletter',
            retryable: true,
          });
        }

        // Send a welcome email to the user
        const locale = await getLocale();
        await sendEmail({
          to: email,
          template: 'subscribeNewsletter',
          context: {
            email,
          },
          locale,
        });

        return {
          success: true,
        };
      }
    )
  );
