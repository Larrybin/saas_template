'use server';

import { z } from 'zod';
import { DomainError } from '@/lib/domain-errors';
import { userActionClient } from '@/lib/safe-action';
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
  .action(async ({ parsedInput: { email } }) => {
    try {
      const subscribed = await isSubscribed(email);

      return {
        success: true,
        subscribed,
      };
    } catch (error) {
      logger.error({ error, email }, 'check newsletter status error');
      if (error instanceof DomainError) {
        throw error;
      }
      throw new DomainError({
        code: ErrorCodes.NewsletterStatusFailed,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to check newsletter status',
        retryable: true,
      });
    }
  });
