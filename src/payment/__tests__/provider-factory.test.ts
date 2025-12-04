import type { MockedFunction } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/payment/services/stripe-payment-factory', () => ({
  createStripePaymentProviderFromEnv: vi.fn(() => ({
    createCheckout: vi.fn(),
    createCreditCheckout: vi.fn(),
    createCustomerPortal: vi.fn(),
    getSubscriptions: vi.fn().mockResolvedValue([]),
  })),
}));

import {
  CREEM_PHASE_GATE_ERROR_MESSAGE,
  DefaultPaymentProviderFactory,
} from '@/payment/provider-factory';
import { createStripePaymentProviderFromEnv } from '@/payment/services/stripe-payment-factory';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DefaultPaymentProviderFactory', () => {
  it('throws a clear error when providerId is creem (not yet supported)', () => {
    const factory = new DefaultPaymentProviderFactory();

    expect(() => factory.getProvider({ providerId: 'creem' })).toThrowError(
      CREEM_PHASE_GATE_ERROR_MESSAGE
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

  it('uses stripe as default provider when providerId is not provided', () => {
    const factory = new DefaultPaymentProviderFactory();
    const mockedFactory = createStripePaymentProviderFromEnv as MockedFunction<
      typeof createStripePaymentProviderFromEnv
    >;

    expect(mockedFactory).not.toHaveBeenCalled();

    const provider1 = factory.getProvider();
    expect(mockedFactory).toHaveBeenCalledTimes(1);

    const provider2 = factory.getProvider();
    expect(mockedFactory).toHaveBeenCalledTimes(1);
    expect(provider2).toBe(provider1);
  });
});
