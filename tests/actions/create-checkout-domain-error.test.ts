import { describe, expect, it, vi } from 'vitest';
import '../helpers/actions';

import { createCheckoutAction } from '@/actions/create-checkout-session';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(),
}));

vi.mock('@/config/website', () => ({
  websiteConfig: {
    i18n: {
      defaultLocale: 'en',
      locales: { en: 'English' },
    },
    routes: {
      defaultLoginRedirect: '/dashboard',
    },
    features: {
      enableDatafastRevenueTrack: false,
    },
  },
}));

vi.mock('@/lib/server/billing-service', () => ({
  getBillingService: () => ({
    startSubscriptionCheckout: vi.fn(),
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

describe('createCheckoutAction DomainError behavior', () => {
  const user = {
    id: 'user_1',
    email: 'user@example.com',
    name: 'User',
  } as User;

  const baseInput = {
    userId: user.id,
    planId: 'plan_basic',
    priceId: 'price_basic',
    metadata: undefined,
  };

  it('rethrows DomainError from dependency', async () => {
    const { getLocale } = await import('next-intl/server');

    (getLocale as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.UnexpectedError,
        message: 'domain failure',
        retryable: true,
      })
    );

    await expect(
      createCheckoutAction({
        parsedInput: baseInput,
        ctx: { user },
      } as never)
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('wraps non-DomainError into UnexpectedError DomainError', async () => {
    const { getLocale } = await import('next-intl/server');

    (getLocale as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('unexpected')
    );

    await expect(
      createCheckoutAction({
        parsedInput: baseInput,
        ctx: { user },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    });
  });
});
