import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigurationError } from '@/storage/types';
import {
  createStripePaymentProviderFromEnv,
  createStripeWebhookHandlerFromEnv,
} from '../stripe-payment-factory';

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

describe('stripe-payment-factory env observability', () => {
  const baseEnv = {
    stripeSecretKey: 'sk_test_123',
    stripeWebhookSecret: 'whsec_123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ConfigurationError when STRIPE_SECRET_KEY is missing for payment provider', () => {
    expect(() =>
      createStripePaymentProviderFromEnv({
        stripeSecretKey: undefined,
        stripeWebhookSecret: baseEnv.stripeWebhookSecret,
      })
    ).toThrow(ConfigurationError);
  });

  it('throws ConfigurationError when STRIPE_WEBHOOK_SECRET is missing for webhook handler', () => {
    expect(() =>
      createStripeWebhookHandlerFromEnv(
        {
          stripeSecretKey: baseEnv.stripeSecretKey,
          stripeWebhookSecret: undefined,
        },
        // @ts-expect-error we only need billingService for type satisfaction in tests
        { billingService: {} }
      )
    ).toThrow(ConfigurationError);
  });
});
