'use server';

import { captchaSchema } from '@/actions/schemas';
import { validateTurnstileToken } from '@/lib/captcha';
import { actionClient } from '@/lib/safe-action';
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
      return {
        success: false,
        valid: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      };
    }
  });
