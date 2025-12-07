import { describe, expect, it, vi } from 'vitest';
import '../helpers/actions';

import { createCreditCheckoutSession } from '@/actions/create-credit-checkout-session';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/credits/server', () => ({
  getCreditPackageById: vi.fn(),
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
    payment: {
      provider: 'stripe',
      creem: {
        subscriptionProducts: {},
        creditProducts: {},
      },
    },
  },
}));

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('en'),
}));

vi.mock('@/payment', () => ({
  createCreditCheckout: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

describe('createCreditCheckoutSession DomainError behavior', () => {
  const user = {
    id: 'user_1',
    email: 'user@example.com',
    name: 'User',
  } as User;

  const baseInput = {
    userId: user.id,
    packageId: 'pkg_basic',
    priceId: 'price_basic',
    metadata: undefined,
  };

  it('throws DomainError when credit package is not found', async () => {
    const { getCreditPackageById } = await import('@/credits/server');

    (
      getCreditPackageById as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce(undefined);

    await expect(
      createCreditCheckoutSession({
        parsedInput: baseInput,
        ctx: { user },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.CreditsInvalidPayload,
      retryable: false,
    });
  });

  it('rethrows DomainError from dependency', async () => {
    const { getCreditPackageById } = await import('@/credits/server');
    const { createCreditCheckout } = await import('@/payment');

    (
      getCreditPackageById as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({ id: 'pkg_basic', amount: 100 });

    (
      createCreditCheckout as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.UnexpectedError,
        message: 'domain failure',
        retryable: true,
      })
    );

    await expect(
      createCreditCheckoutSession({
        parsedInput: baseInput,
        ctx: { user },
      } as never)
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('wraps non-DomainError into UnexpectedError DomainError', async () => {
    const { getCreditPackageById } = await import('@/credits/server');
    const { createCreditCheckout } = await import('@/payment');

    (
      getCreditPackageById as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({ id: 'pkg_basic', amount: 100 });

    (
      createCreditCheckout as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error('unexpected'));

    await expect(
      createCreditCheckoutSession({
        parsedInput: baseInput,
        ctx: { user },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.UnexpectedError,
      retryable: true,
    });
  });
});
