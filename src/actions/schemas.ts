import { z } from 'zod';

export const getActiveSubscriptionInputSchema = z.object({
  userId: z.string().min(1, { error: 'User ID is required' }),
});

export const captchaSchema = z.object({
  captchaToken: z.string().min(1, { error: 'Captcha token is required' }),
});
