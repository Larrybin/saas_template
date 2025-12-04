import { describe, expect, it, vi } from 'vitest';

vi.mock('@/payment/services/stripe-payment-factory', () => ({
  createStripePaymentProviderFromEnv: vi.fn(() => ({
    createCheckout: vi.fn(),
    createCreditCheckout: vi.fn(),
    createCustomerPortal: vi.fn(),
    getSubscriptions: vi.fn().mockResolvedValue([]),
  })),
}));

import { DefaultPaymentProviderFactory } from '@/payment/provider-factory';

describe('DefaultPaymentProviderFactory', () => {
  it('throws a clear error when providerId is creem (not yet supported)', () => {
    const factory = new DefaultPaymentProviderFactory();

    expect(() => factory.getProvider({ providerId: 'creem' })).toThrowError(
      'Unsupported payment provider: creem'
    );
  });
});
