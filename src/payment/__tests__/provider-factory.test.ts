import type { MockedFunction } from 'vitest';
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
import { createStripePaymentProviderFromEnv } from '@/payment/services/stripe-payment-factory';

describe('DefaultPaymentProviderFactory', () => {
  it('throws a clear error when providerId is creem (not yet supported)', () => {
    const factory = new DefaultPaymentProviderFactory();

    expect(() => factory.getProvider({ providerId: 'creem' })).toThrowError(
      /Payment provider 'creem' is not yet implemented\./
    );
  });

  it('lazily initializes the stripe provider on first access', () => {
    const factory = new DefaultPaymentProviderFactory();
    const mockedFactory = createStripePaymentProviderFromEnv as MockedFunction<
      typeof createStripePaymentProviderFromEnv
    >;

    expect(mockedFactory).not.toHaveBeenCalled();

    const provider1 = factory.getProvider({ providerId: 'stripe' });
    expect(mockedFactory).toHaveBeenCalledTimes(1);

    const provider2 = factory.getProvider({ providerId: 'stripe' });
    expect(mockedFactory).toHaveBeenCalledTimes(1);
    expect(provider2).toBe(provider1);
  });
});
