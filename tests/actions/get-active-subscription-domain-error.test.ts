import { afterEach, describe, expect, it, vi } from 'vitest';

import { getActiveSubscriptionAction } from '@/actions/get-active-subscription';
import { serverEnv } from '@/env/server';
import type { User } from '@/lib/auth-types';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/lib/safe-action', () => ({
  userActionClient: {
    schema: () => ({
      // 在测试中直接暴露内部实现，绕过 safe-action 封装
      action: (impl: unknown) => impl,
    }),
  },
}));

vi.mock('@/payment', () => ({
  getSubscriptions: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
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
    ).rejects.toMatchObject<Partial<DomainError>>({
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
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCodes.SubscriptionFetchFailed,
      retryable: true,
    });
  });
});
