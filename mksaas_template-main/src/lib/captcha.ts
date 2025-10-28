import { websiteConfig } from '@/config/website';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export async function validateTurnstileToken(token: string) {
  const turnstileEnabled = websiteConfig.features.enableTurnstileCaptcha;
  if (!turnstileEnabled) {
    console.log('validateTurnstileToken, turnstile is disabled');
    return false;
  }

  if (!process.env.TURNSTILE_SECRET_KEY) {
    console.error('validateTurnstileToken, TURNSTILE_SECRET_KEY is not set');
    return false;
  }

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
    }
  );

  const data = (await response.json()) as TurnstileResponse;
  return data.success;
}
