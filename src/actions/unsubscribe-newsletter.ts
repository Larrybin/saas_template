'use server';

import { z } from 'zod';
import { userActionClient } from '@/lib/safe-action';
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
  .action(async ({ parsedInput: { email } }) => {
    try {
      const unsubscribed = await unsubscribe(email);

      if (!unsubscribed) {
        logger.error({ email }, 'unsubscribe newsletter error');
        return {
          success: false,
          error: 'Failed to unsubscribe from the newsletter',
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      logger.error({ error }, 'unsubscribe newsletter error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
