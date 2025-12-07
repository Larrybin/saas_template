import { describe, expect, it, vi } from 'vitest';
import { getMembershipService } from '@/lib/server/membership-service';
import { getSubscriptions } from '@/payment';
import { PaymentTypes } from '@/payment/types';
import {
  type AccessCapability,
  getUserAccessCapabilities,
  setExternalAccessProvider,
} from '../auth-domain';

vi.mock('@/payment', () => ({
  getSubscriptions: vi.fn(),
}));

vi.mock('@/lib/server/membership-service', () => ({
  getMembershipService: vi.fn(),
}));

vi.mock('@/lib/price-plan', () => ({
  findPlanByPriceId: vi.fn(),
}));

describe('getUserAccessCapabilities', () => {
  it('returns empty capabilities when userId is empty', async () => {
    const result = await getUserAccessCapabilities('');
    expect(result).toEqual([]);
  });

  it('returns plan:pro when user has active subscription', async () => {
    const getSubscriptionsMock = vi.mocked(getSubscriptions);
    const getMembershipServiceMock = vi.mocked(getMembershipService);
    const { findPlanByPriceId } = await import('@/lib/price-plan');
    const findPlanByPriceIdMock = vi.mocked(findPlanByPriceId);

    getSubscriptionsMock.mockResolvedValueOnce([
      {
        id: 'sub_1',
        customerId: 'cus_1',
        status: 'active',
        priceId: 'price_pro',
        type: PaymentTypes.SUBSCRIPTION,
        createdAt: new Date(),
      },
    ]);

    getMembershipServiceMock.mockReturnValueOnce({
      findActiveMembershipsByUserIds: vi.fn().mockResolvedValue([]),
      grantLifetimeMembership: vi.fn(),
    });
    findPlanByPriceIdMock.mockReturnValueOnce({
      id: 'pro',
      isFree: false,
      isLifetime: false,
      prices: [],
    });

    const result = await getUserAccessCapabilities('user_1');
    expect(result).toContain('plan:pro');
    expect(result).not.toContain('plan:lifetime');
  });

  it('returns plan:lifetime when user has active lifetime membership', async () => {
    const getSubscriptionsMock = vi.mocked(getSubscriptions);
    const getMembershipServiceMock = vi.mocked(getMembershipService);
    const { findPlanByPriceId } = await import('@/lib/price-plan');
    const findPlanByPriceIdMock = vi.mocked(findPlanByPriceId);

    getSubscriptionsMock.mockResolvedValueOnce([]);

    getMembershipServiceMock.mockReturnValueOnce({
      findActiveMembershipsByUserIds: vi.fn().mockResolvedValue([
        {
          id: 'lm_1',
          userId: 'user_1',
          priceId: 'price_lifetime',
          cycleRefDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          revokedAt: null,
        },
      ]),
      grantLifetimeMembership: vi.fn(),
    });
    findPlanByPriceIdMock.mockReturnValueOnce({
      id: 'lifetime',
      isFree: false,
      isLifetime: true,
      prices: [],
    });

    const result = await getUserAccessCapabilities('user_1');
    expect(result).toContain('plan:lifetime');
  });

  it('returns empty capabilities when underlying services throw', async () => {
    const getSubscriptionsMock = vi.mocked(getSubscriptions);
    const getMembershipServiceMock = vi.mocked(getMembershipService);

    getSubscriptionsMock.mockRejectedValueOnce(new Error('subscription error'));
    getMembershipServiceMock.mockReturnValueOnce({
      findActiveMembershipsByUserIds: vi.fn().mockResolvedValue([]),
      grantLifetimeMembership: vi.fn(),
    });

    const result = await getUserAccessCapabilities('user_1');
    expect(result).toEqual([]);
  });

  it('merges external access capabilities when provided', async () => {
    const getSubscriptionsMock = vi.mocked(getSubscriptions);
    const getMembershipServiceMock = vi.mocked(getMembershipService);

    getSubscriptionsMock.mockResolvedValueOnce([]);
    getMembershipServiceMock.mockReturnValueOnce({
      findActiveMembershipsByUserIds: vi.fn().mockResolvedValue([]),
      grantLifetimeMembership: vi.fn(),
    });

    const externalCapability: AccessCapability =
      'feature:creem:any-subscription';

    setExternalAccessProvider({
      async hasAccess(userId, capability) {
        if (!userId) {
          return false;
        }
        return capability === externalCapability;
      },
    });

    const result = await getUserAccessCapabilities('user_1', {
      externalCapabilities: [externalCapability],
    });

    expect(result).toContain(externalCapability);

    // Reset to default no-op provider to avoid leaking state between tests
    setExternalAccessProvider(undefined as never);
  });
});
