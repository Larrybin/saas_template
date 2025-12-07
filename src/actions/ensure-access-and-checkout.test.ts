import '../../tests/helpers/actions';
import { describe, expect, it, vi } from 'vitest';
import * as billingServiceModule from '@/lib/server/billing-service';
import * as authDomain from '@/lib/server/user-access-capabilities';
import * as paymentModule from '@/payment';
import { ensureAccessAndCheckoutAction } from './ensure-access-and-checkout';

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

const mockUserCtx = {
  user: {
    id: 'user_1',
    email: 'user@example.com',
    name: 'Test User',
    banned: false,
    role: 'user',
  },
};

describe('ensureAccessAndCheckoutAction', () => {
  it('returns alreadyHasAccess when user already has capability', async () => {
    const getUserAccessCapabilitiesMock = vi.mocked(
      authDomain.getUserAccessCapabilities
    );
    getUserAccessCapabilitiesMock.mockResolvedValueOnce(['plan:pro']);

    const result = await ensureAccessAndCheckoutAction({
      parsedInput: {
        mode: 'subscription',
        capability: 'plan:pro',
        planId: 'pro',
        priceId: 'price_pro_monthly',
      },
      ctx: mockUserCtx,
    } as never);

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
    getBillingServiceMock.mockReturnValueOnce({
      startSubscriptionCheckout: vi.fn().mockResolvedValue({
        url: 'https://checkout.example.com/session/sub_1',
        id: 'sub_1',
      }),
      startCreditCheckout: vi.fn(),
      handleRenewal: vi.fn(),
      grantLifetimePlan: vi.fn(),
    });

    const result = (await ensureAccessAndCheckoutAction({
      parsedInput: {
        mode: 'subscription',
        capability: 'plan:pro',
        planId: 'pro',
        priceId: 'price_pro_monthly',
      },
      ctx: mockUserCtx,
    } as never)) as any;

    expect(result.success).toBe(true);
    expect(result.data.alreadyHasAccess).toBe(false);
    expect(result.data.checkoutUrl).toBe(
      'https://checkout.example.com/session/sub_1'
    );
    expect(result.data.checkoutId).toBe('sub_1');
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

    const result = (await ensureAccessAndCheckoutAction({
      parsedInput: {
        mode: 'credits',
        capability: 'feature:ai',
        packageId: 'basic',
        priceId: 'price_credits_basic',
      },
      ctx: mockUserCtx,
    } as never)) as any;

    expect(result.success).toBe(true);
    expect(result.data.alreadyHasAccess).toBe(false);
    expect(result.data.checkoutUrl).toBe(
      'https://checkout.example.com/session/cred_1'
    );
    expect(result.data.checkoutId).toBe('cred_1');
  });
});
