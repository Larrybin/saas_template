/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccessAndCheckoutAction } from '@/actions/ensure-access-and-checkout';
import { useAccessAndCheckout } from '../use-access-and-checkout';

vi.mock('@/hooks/use-auth-error-handler', () => ({
  useAuthErrorHandler: () => () => false,
  handleAuthFromEnvelope: () => {},
}));

vi.mock('@/actions/ensure-access-and-checkout', () => ({
  ensureAccessAndCheckoutAction: vi.fn(),
}));

const ensureAccessAndCheckoutActionMock = vi.mocked(
  ensureAccessAndCheckoutAction
);

const queryClient = new QueryClient();

const createWrapper = () => {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useAccessAndCheckout', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('sets hasAccess when user already has capability', async () => {
    ensureAccessAndCheckoutActionMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          alreadyHasAccess: true,
        },
      },
    });

    const { result } = renderHook(
      () =>
        useAccessAndCheckout({
          capability: 'plan:pro',
          mode: 'subscription',
          planId: 'pro',
          priceId: 'price_pro',
        }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.startCheckout();
    });

    await waitFor(() => {
      expect(result.current.hasAccess).toBe(true);
    });
  });

  it('navigates to checkoutUrl when access is not present', async () => {
    const originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = { href: '' };

    ensureAccessAndCheckoutActionMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          alreadyHasAccess: false,
          checkoutUrl: 'https://checkout.example.com/session/123',
        },
      },
    });

    const { result } = renderHook(
      () =>
        useAccessAndCheckout({
          capability: 'plan:pro',
          mode: 'subscription',
          planId: 'pro',
          priceId: 'price_pro',
        }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.startCheckout();
    });

    expect(window.location.href).toBe(
      'https://checkout.example.com/session/123'
    );

    (window as any).location = originalLocation;
  });
});
