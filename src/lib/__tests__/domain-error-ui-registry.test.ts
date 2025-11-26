import { describe, expect, it } from 'vitest';

import { getErrorUiStrategy } from '../domain-error-ui-registry';

describe('domain-error-ui-registry', () => {
  it('returns strategy for AUTH_UNAUTHORIZED', () => {
    const strategy = getErrorUiStrategy('AUTH_UNAUTHORIZED');

    expect(strategy).not.toBeNull();
    expect(strategy?.severity).toBe('warning');
    expect(strategy?.action).toBe('redirectToLogin');
    expect(strategy?.source).toBe('auth');
  });

  it('returns strategy for CREDITS_INSUFFICIENT_BALANCE', () => {
    const strategy = getErrorUiStrategy('CREDITS_INSUFFICIENT_BALANCE');

    expect(strategy).not.toBeNull();
    expect(strategy?.severity).toBe('warning');
    expect(strategy?.action).toBe('openCreditsPage');
    expect(strategy?.source).toBe('credits');
  });

  it('returns strategy for PAYMENT_SECURITY_VIOLATION', () => {
    const strategy = getErrorUiStrategy('PAYMENT_SECURITY_VIOLATION');

    expect(strategy).not.toBeNull();
    expect(strategy?.severity).toBe('error');
    expect(strategy?.source).toBe('payment');
  });

  it('returns strategy for STORAGE_FILE_TOO_LARGE', () => {
    const strategy = getErrorUiStrategy('STORAGE_FILE_TOO_LARGE');

    expect(strategy).not.toBeNull();
    expect(strategy?.severity).toBe('error');
    expect(strategy?.source).toBe('storage');
  });

  it('returns null for unknown code', () => {
    const strategy = getErrorUiStrategy('SOME_UNKNOWN_CODE');

    expect(strategy).toBeNull();
  });
});
