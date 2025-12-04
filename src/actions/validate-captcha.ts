'use server';

import { captchaSchema } from '@/actions/schemas';
import { validateTurnstileToken } from '@/lib/captcha';
import { actionClient, withActionErrorBoundary } from '@/lib/safe-action';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';

const logger = getLogger({ span: 'actions.validate-captcha' });

// Create a safe action for captcha validation
export const validateCaptchaAction = actionClient.schema(captchaSchema).action(
  withActionErrorBoundary(
    {
      logger,
      logMessage: 'Captcha validation error',
      fallbackMessage: 'Failed to validate captcha',
      code: ErrorCodes.CaptchaValidationFailed,
      retryable: true,
    },
    async ({ parsedInput }) => {
      const { captchaToken } = parsedInput;

      const isValid = await validateTurnstileToken(captchaToken);

      return {
        success: true,
        valid: isValid,
      };
    }
  )
);
