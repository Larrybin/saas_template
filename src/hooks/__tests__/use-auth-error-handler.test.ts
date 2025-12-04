import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Routes } from '@/routes';
import { routerPushMock, toastMock } from '../../../tests/helpers/hooks';
import {
  handleAuthFromEnvelope,
  useAuthErrorHandler,
} from '../use-auth-error-handler';

describe('useAuthErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles AUTH_UNAUTHORIZED by showing toast and redirecting to login', () => {
    const handleAuthError = useAuthErrorHandler();

    const handled = handleAuthError({
      code: 'AUTH_UNAUTHORIZED',
      message: 'Please sign in',
    });

    expect(handled).toBe(true);
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledWith(Routes.Login);
  });

  it('handles AUTH_BANNED by showing toast and redirecting to login', () => {
    const handleAuthError = useAuthErrorHandler();

    const handled = handleAuthError({
      code: 'AUTH_BANNED',
      message: 'Your account is banned',
    });

    expect(handled).toBe(true);
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledWith(Routes.Login);
  });

  it('returns false and does nothing for non-auth codes', () => {
    const handleAuthError = useAuthErrorHandler();

    const handled = handleAuthError({
      code: 'SOME_OTHER_CODE',
      message: 'ignored',
    });

    expect(handled).toBe(false);
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it('returns false when error is null or missing code', () => {
    const handleAuthError = useAuthErrorHandler();

    expect(handleAuthError(null)).toBe(false);
    expect(handleAuthError({} as never)).toBe(false);
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});

describe('handleAuthFromEnvelope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards handled auth codes to provided handler', () => {
    const handler = vi.fn();

    handleAuthFromEnvelope(handler, {
      code: 'AUTH_UNAUTHORIZED',
      error: 'Unauthorized',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      code: 'AUTH_UNAUTHORIZED',
      message: 'Unauthorized',
    });
  });

  it('ignores envelopes without auth codes', () => {
    const handler = vi.fn();

    handleAuthFromEnvelope(handler, {
      code: 'SOME_OTHER_CODE',
      error: 'ignored',
    });

    handleAuthFromEnvelope(handler, null);
    handleAuthFromEnvelope(handler, { error: 'no code' });

    expect(handler).not.toHaveBeenCalled();
  });
});
