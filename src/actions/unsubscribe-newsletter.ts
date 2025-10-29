'use server';

import { userActionClient } from '@/lib/safe-action';
import { unsubscribe } from '@/newsletter';
import { z } from 'zod';

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
        console.error('unsubscribe newsletter error:', email);
        return {
          success: false,
          error: 'Failed to unsubscribe from the newsletter',
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error('unsubscribe newsletter error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
