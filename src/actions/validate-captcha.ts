'use server';

import { captchaSchema } from '@/actions/schemas';
import { validateTurnstileToken } from '@/lib/captcha';
import { DomainError } from '@/lib/domain-errors';
import { actionClient } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';

const logger = getLogger({ span: 'actions.validate-captcha' });

// Create a safe action for captcha validation
export const validateCaptchaAction = actionClient
  .schema(captchaSchema)
  .action(async ({ parsedInput }) => {
    const { captchaToken } = parsedInput;

    try {
      const isValid = await validateTurnstileToken(captchaToken);

      return {
        success: true,
        valid: isValid,
      };
    } catch (error) {
      logger.error({ error }, 'Captcha validation error');
      if (error instanceof DomainError) {
        throw error;
      }
      throw new DomainError({
        code: ErrorCodes.CaptchaValidationFailed,
        message:
          error instanceof Error ? error.message : 'Failed to validate captcha',
        retryable: true,
      });
    }
  });
