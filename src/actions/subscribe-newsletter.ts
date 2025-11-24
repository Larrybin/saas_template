'use server';

import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { actionClient } from '@/lib/safe-action';
import { getLogger } from '@/lib/server/logger';
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
  .action(async ({ parsedInput: { email } }) => {
    // Do not check if the user is authenticated here
    try {
      const subscribed = await subscribe(email);

      if (!subscribed) {
        logger.error({ email }, 'subscribe newsletter error');
        return {
          success: false,
          error: 'Failed to subscribe to the newsletter',
        };
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
    } catch (error) {
      logger.error({ error }, 'subscribe newsletter error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
