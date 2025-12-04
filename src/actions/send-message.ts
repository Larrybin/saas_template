'use server';

import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { websiteConfig } from '@/config/website';
import { DomainError } from '@/lib/domain-errors';
import { actionClient, withActionErrorBoundary } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { createEmailLogFields, getLogger } from '@/lib/server/logger';
import { sendEmail } from '@/mail';

const logger = getLogger({ span: 'actions.send-message' });

/**
 * DOC: When using Zod for validation, how can I localize error messages?
 * https://next-intl.dev/docs/environments/actions-metadata-route-handlers#server-actions
 */
// Contact form schema for validation
const contactFormSchema = z.object({
  name: z
    .string()
    .min(3, { error: 'Name must be at least 3 characters' })
    .max(30, { error: 'Name must not exceed 30 characters' }),
  email: z.email({ error: 'Please enter a valid email address' }),
  message: z
    .string()
    .min(10, { error: 'Message must be at least 10 characters' })
    .max(500, { error: 'Message must not exceed 500 characters' }),
});

// Create a safe action for contact form submission
export const sendMessageAction = actionClient.schema(contactFormSchema).action(
  withActionErrorBoundary(
    {
      logger,
      logMessage: 'send message error',
      getLogContext: ({ parsedInput }) => {
        const email = (parsedInput as { email: string }).email;
        return createEmailLogFields(email);
      },
      fallbackMessage: 'Failed to send the message',
      code: ErrorCodes.ContactSendFailed,
      retryable: true,
    },
    async ({ parsedInput }) => {
      // Do not check if the user is authenticated here
      const { name, email, message } = parsedInput;

      if (!websiteConfig.mail.supportEmail) {
        throw new Error('The mail receiver is not set');
      }

      const locale = await getLocale();

      // Send message as an email to admin
      const result = await sendEmail({
        to: websiteConfig.mail.supportEmail,
        template: 'contactMessage',
        context: {
          name,
          email,
          message,
        },
        locale,
      });

      if (!result) {
        throw new DomainError({
          code: ErrorCodes.ContactSendFailed,
          message: 'Failed to send the message',
          retryable: true,
        });
      }

      return {
        success: true,
      };
    }
  )
);
