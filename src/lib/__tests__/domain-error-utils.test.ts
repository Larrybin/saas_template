import { describe, expect, it, vi } from 'vitest';

import { ErrorCodes } from '@/lib/server/error-codes';
import {
  type EnvelopeWithDomainError,
  unwrapEnvelopeOrThrowDomainError,
} from '../domain-error-utils';

describe('unwrapEnvelopeOrThrowDomainError', () => {
  it('returns payload when success flag is true', () => {
    const envelope: EnvelopeWithDomainError<{ success: true; value: number }> =
      {
        success: true,
        value: 42,
      };

    const result = unwrapEnvelopeOrThrowDomainError(envelope, {
      defaultErrorMessage: 'should not be used',
    });

    expect(result).toBe(envelope);
    expect(result.value).toBe(42);
  });

  it('throws default error when data is undefined', () => {
    const fn = () =>
      unwrapEnvelopeOrThrowDomainError<{ success: true } | undefined>(
        undefined,
        {
          defaultErrorMessage: 'Failed to load data',
        }
      );

    expect(fn).toThrowError('Failed to load data');
  });

  it('invokes auth handler and throws domain error with code and retryable', () => {
    const handleAuthEnvelope = vi.fn();

    const envelope: EnvelopeWithDomainError<never> = {
      success: false,
      error: 'Insufficient credits',
      code: ErrorCodes.CreditsInsufficientBalance,
      retryable: false,
    };

    let thrown: (Error & { code?: string; retryable?: boolean }) | null = null;

    try {
      unwrapEnvelopeOrThrowDomainError(envelope, {
        defaultErrorMessage: 'Fallback message',
        handleAuthEnvelope,
      });
    } catch (error) {
      thrown = error as Error & { code?: string; retryable?: boolean };
    }

    expect(handleAuthEnvelope).toHaveBeenCalledTimes(1);
    expect(handleAuthEnvelope).toHaveBeenCalledWith({
      code: ErrorCodes.CreditsInsufficientBalance,
      error: 'Insufficient credits',
    });

    expect(thrown).not.toBeNull();
    expect(thrown?.message).toBe('Insufficient credits');
    expect(thrown?.code).toBe(ErrorCodes.CreditsInsufficientBalance);
    expect(thrown?.retryable).toBe(false);
  });

  it('uses mapped fallback message when error text is missing', () => {
    const envelope: EnvelopeWithDomainError<never> = {
      success: false,
      // captcha error has a configured fallback message in DOMAIN_ERROR_MESSAGES
      code: ErrorCodes.CaptchaValidationFailed,
    };

    let thrown: Error | null = null;

    try {
      unwrapEnvelopeOrThrowDomainError(envelope, {
        defaultErrorMessage: 'Default captcha error',
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.message).toBe('Captcha verification error');
  });

  it('falls back to provided default when code is unknown and error is missing', () => {
    const envelope: EnvelopeWithDomainError<never> = {
      success: false,
      code: 'SOME_UNKNOWN_CODE',
    } as EnvelopeWithDomainError<never>;

    let thrown: Error | null = null;

    try {
      unwrapEnvelopeOrThrowDomainError(envelope, {
        defaultErrorMessage: 'Generic failure',
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.message).toBe('Generic failure');
  });
});
