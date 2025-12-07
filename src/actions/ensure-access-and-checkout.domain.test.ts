import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as billingServiceModule from '@/lib/server/billing-service';
import * as authDomain from '@/lib/server/user-access-capabilities';
import * as paymentModule from '@/payment';
import { ensureAccessAndMaybeStartCheckout } from './ensure-access-and-checkout';

vi.mock('@/lib/server/user-access-capabilities', () => ({
  getUserAccessCapabilities: vi.fn(),
}));

vi.mock('@/lib/server/billing-service', () => ({
  getBillingService: vi.fn(),
}));

vi.mock('@/payment', () => ({
  createCreditCheckout: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('en'),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn().mockReturnValue(undefined),
  })),
  headers: vi.fn(async () => new Headers()),
}));

describe('ensureAccessAndMaybeStartCheckout (domain)', () => {
  const userId = 'user_1';
  const customerEmail = 'user@example.com';
  const userName = 'User One';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns alreadyHasAccess when user already has capability', async () => {
    const getUserAccessCapabilitiesMock = vi.mocked(
      authDomain.getUserAccessCapabilities
    );
    getUserAccessCapabilitiesMock.mockResolvedValueOnce(['plan:pro']);

    const result = await ensureAccessAndMaybeStartCheckout({
      input: {
        mode: 'subscription',
        capability: 'plan:pro',
        planId: 'pro',
        priceId: 'price_pro_monthly',
      },
      userId,
      customerEmail,
      userName,
    });

    expect(result).toEqual({
      success: true,
      data: {
        alreadyHasAccess: true,
      },
    });
  });

  it('starts subscription checkout when user lacks capability', async () => {
    const getUserAccessCapabilitiesMock = vi.mocked(
      authDomain.getUserAccessCapabilities
    );
    const getBillingServiceMock = vi.mocked(
      billingServiceModule.getBillingService
    );

    getUserAccessCapabilitiesMock.mockResolvedValueOnce([]);
    const startSubscriptionCheckout = vi.fn().mockResolvedValue({
      url: 'https://checkout.example.com/session/sub_1',
      id: 'sub_1',
    });
    getBillingServiceMock.mockReturnValueOnce({
      startSubscriptionCheckout,
      startCreditCheckout: vi.fn(),
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    });

    const result = await ensureAccessAndMaybeStartCheckout({
      input: {
        mode: 'subscription',
        capability: 'plan:pro',
        planId: 'pro',
        priceId: 'price_pro_monthly',
      },
      userId,
      customerEmail,
      userName,
    });

    expect(result.success).toBe(true);
    expect(result.data.alreadyHasAccess).toBe(false);
    expect(result.data.checkoutUrl).toBe(
      'https://checkout.example.com/session/sub_1'
    );
    expect(result.data.checkoutId).toBe('sub_1');
    expect(startSubscriptionCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          userId,
          userName,
        }),
      })
    );
  });

  it('starts credit checkout when user lacks capability and mode=credits', async () => {
    const getUserAccessCapabilitiesMock = vi.mocked(
      authDomain.getUserAccessCapabilities
    );
    const createCreditCheckoutMock = vi.mocked(
      paymentModule.createCreditCheckout
    );

    getUserAccessCapabilitiesMock.mockResolvedValueOnce([]);
    createCreditCheckoutMock.mockResolvedValueOnce({
      url: 'https://checkout.example.com/session/cred_1',
      id: 'cred_1',
    });

    const result = await ensureAccessAndMaybeStartCheckout({
      input: {
        mode: 'credits',
        capability: 'feature:ai',
        packageId: 'basic',
        priceId: 'price_credits_basic',
      },
      userId,
      customerEmail,
      userName,
    });

    expect(result.success).toBe(true);
    expect(result.data.alreadyHasAccess).toBe(false);
    expect(result.data.checkoutUrl).toBe(
      'https://checkout.example.com/session/cred_1'
    );
    expect(result.data.checkoutId).toBe('cred_1');
    expect(createCreditCheckoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          userId,
          userName,
          packageId: 'basic',
          type: 'credit_purchase',
          credits: '100',
        }),
      })
    );
  });

  it('falls back to customer email as metadata userName when absent', async () => {
    const getUserAccessCapabilitiesMock = vi.mocked(
      authDomain.getUserAccessCapabilities
    );
    const createCreditCheckoutMock = vi.mocked(
      paymentModule.createCreditCheckout
    );

    getUserAccessCapabilitiesMock.mockResolvedValueOnce([]);
    createCreditCheckoutMock.mockResolvedValueOnce({
      url: 'https://checkout.example.com/session/cred_fallback',
      id: 'cred_fallback',
    });

    await ensureAccessAndMaybeStartCheckout({
      input: {
        mode: 'credits',
        capability: 'feature:ai',
        packageId: 'basic',
        priceId: 'price_credits_basic',
      },
      userId,
      customerEmail,
      userName: null,
    });

    expect(createCreditCheckoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          userId,
          userName: customerEmail,
        }),
      })
    );
  });
});
