import { afterEach, describe, expect, it, vi } from 'vitest';
import '../helpers/actions';

import { getActiveSubscriptionAction } from '@/actions/get-active-subscription';
import { serverEnv } from '@/env/server';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/payment', () => ({
  getSubscriptions: vi.fn(),
}));

describe('getActiveSubscriptionAction DomainError behavior', () => {
  const user = { id: 'user_1' } as User;
  const originalStripeSecretKey = serverEnv.stripeSecretKey;
  const originalStripeWebhookSecret = serverEnv.stripeWebhookSecret;

  afterEach(() => {
    serverEnv.stripeSecretKey = originalStripeSecretKey;
    serverEnv.stripeWebhookSecret = originalStripeWebhookSecret;
  });

  it('returns null data when stripe env is not configured', async () => {
    serverEnv.stripeSecretKey = undefined;
    serverEnv.stripeWebhookSecret = undefined;

    const result = await getActiveSubscriptionAction({
      ctx: { user },
    } as never);

    expect(result).toEqual({
      success: true,
      data: null,
    });
  });

  it('rethrows DomainError from getSubscriptions', async () => {
    const { getSubscriptions } = await import('@/payment');

    serverEnv.stripeSecretKey = 'sk_test';
    serverEnv.stripeWebhookSecret = 'whsec_test';

    (
      getSubscriptions as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.SubscriptionFetchFailed,
        message: 'domain failure',
        retryable: true,
      })
    );

    await expect(
      getActiveSubscriptionAction({
        ctx: { user },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.SubscriptionFetchFailed,
      retryable: true,
    });
  });

  it('wraps unexpected errors into SubscriptionFetchFailed DomainError', async () => {
    const { getSubscriptions } = await import('@/payment');

    serverEnv.stripeSecretKey = 'sk_test';
    serverEnv.stripeWebhookSecret = 'whsec_test';

    (
      getSubscriptions as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error('unexpected'));

    await expect(
      getActiveSubscriptionAction({
        ctx: { user },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.SubscriptionFetchFailed,
      retryable: true,
    });
  });
});
