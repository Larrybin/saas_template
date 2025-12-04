import { beforeEach, describe, expect, it, vi } from 'vitest';

import { routerPushMock, toastMock } from '../../../tests/helpers/hooks';

const handleAuthFromEnvelopeMock = vi.fn();
const authErrorHandlerMock = vi.fn();

vi.mock('@/hooks/use-auth-error-handler', () => ({
  useAuthErrorHandler: () => authErrorHandlerMock,
  handleAuthFromEnvelope: (
    ...args: Parameters<typeof handleAuthFromEnvelopeMock>
  ) => handleAuthFromEnvelopeMock(...args),
}));

import { Routes } from '@/routes';
import { useCreditsErrorUi } from '../use-credits-error-ui';

describe('useCreditsErrorUi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates AUTH_UNAUTHORIZED to auth error handler', () => {
    const { handleCreditsError } = useCreditsErrorUi();

    handleCreditsError({
      code: 'AUTH_UNAUTHORIZED',
      error: 'Unauthorized',
    });

    expect(handleAuthFromEnvelopeMock).toHaveBeenCalledTimes(1);
    expect(handleAuthFromEnvelopeMock).toHaveBeenCalledWith(
      authErrorHandlerMock,
      {
        code: 'AUTH_UNAUTHORIZED',
        error: 'Unauthorized',
      }
    );
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it('shows toast and redirects for CREDITS_INSUFFICIENT_BALANCE', () => {
    const { handleCreditsError } = useCreditsErrorUi();

    handleCreditsError({
      code: 'CREDITS_INSUFFICIENT_BALANCE',
      error: undefined,
    });

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledWith(Routes.SettingsCredits);
    expect(handleAuthFromEnvelopeMock).not.toHaveBeenCalled();
  });

  it('shows generic toast for other credits errors', () => {
    const { handleCreditsError } = useCreditsErrorUi();

    handleCreditsError({
      code: 'CREDITS_PLAN_POLICY_MISSING',
      error: 'plan missing',
    });

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(routerPushMock).not.toHaveBeenCalled();
    expect(handleAuthFromEnvelopeMock).not.toHaveBeenCalled();
  });
});
