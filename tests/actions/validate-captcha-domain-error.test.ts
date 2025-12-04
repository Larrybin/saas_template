import { describe, expect, it, vi } from 'vitest';
import '../helpers/actions';

import { validateCaptchaAction } from '@/actions/validate-captcha';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/lib/captcha', () => ({
  validateTurnstileToken: vi.fn(),
}));

describe('validateCaptchaAction DomainError behavior', () => {
  const captchaToken = 'token-xyz';

  it('returns success with validation result when provider succeeds', async () => {
    const { validateTurnstileToken } = await import('@/lib/captcha');

    (
      validateTurnstileToken as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(true);

    const result = await validateCaptchaAction({
      parsedInput: { captchaToken },
    } as never);

    expect(result).toEqual({
      success: true,
      valid: true,
    });
  });

  it('rethrows DomainError from provider', async () => {
    const { validateTurnstileToken } = await import('@/lib/captcha');

    (
      validateTurnstileToken as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.CaptchaValidationFailed,
        message: 'captcha domain failure',
        retryable: true,
      })
    );

    await expect(
      validateCaptchaAction({
        parsedInput: { captchaToken },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.CaptchaValidationFailed,
      retryable: true,
    });
  });

  it('wraps unexpected errors into CaptchaValidationFailed DomainError', async () => {
    const { validateTurnstileToken } = await import('@/lib/captcha');

    (
      validateTurnstileToken as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error('network failure'));

    await expect(
      validateCaptchaAction({
        parsedInput: { captchaToken },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.CaptchaValidationFailed,
      retryable: true,
    });
  });
});
