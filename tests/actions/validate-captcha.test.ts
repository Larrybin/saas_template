import { describe, expect, test } from 'vitest';
import { captchaSchema } from '@/actions/schemas';

describe('validateCaptchaAction schema', () => {
  test('accepts non-empty captcha token', () => {
    const payload = captchaSchema.parse({ captchaToken: 'token-xyz' });
    expect(payload.captchaToken).toBe('token-xyz');
  });

  test('rejects empty captcha token', () => {
    expect(() => captchaSchema.parse({ captchaToken: '' })).toThrowError(
      /Captcha token is required/
    );
  });
});
