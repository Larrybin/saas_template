'use server';

import { userActionClient } from '@/lib/safe-action';
import { isSubscribed } from '@/newsletter';
import { z } from 'zod';

// Newsletter schema for validation
const newsletterSchema = z.object({
  email: z.email({ error: 'Please enter a valid email address' }),
});

// Create a safe action to check if a user is subscribed to the newsletter
export const checkNewsletterStatusAction = userActionClient
  .schema(newsletterSchema)
  .action(async ({ parsedInput: { email } }) => {
    try {
      const subscribed = await isSubscribed(email);

      return {
        success: true,
        subscribed,
      };
    } catch (error) {
      console.error('check newsletter status error:', error);
      return {
        success: false,
        subscribed: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
