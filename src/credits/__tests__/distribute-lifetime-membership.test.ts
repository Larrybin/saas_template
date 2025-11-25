import { describe, expect, it, vi } from 'vitest';
import {
  collectValidLifetimeMemberships,
  createCachedPlanResolver,
} from '@/credits/distribute';
import type { LifetimeMembershipRecord } from '@/payment/data-access/user-lifetime-membership-repository';
import type { PricePlan } from '@/payment/types';

const createMembership = (
  overrides: Partial<LifetimeMembershipRecord> = {}
): LifetimeMembershipRecord => {
  return {
    id: 'mem-1',
    userId: 'user-1',
    priceId: 'price_lifetime',
    cycleRefDate: new Date('2024-01-01T00:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    revokedAt: null,
    ...overrides,
  };
};

const createPlan = (overrides: Partial<PricePlan> = {}): PricePlan => ({
  id: 'plan_lifetime',
  name: 'Lifetime',
  description: '',
  features: [],
  limits: [],
  prices: [],
  isFree: false,
  isLifetime: true,
  popular: false,
  disabled: false,
  credits: {
    enable: true,
    amount: 1000,
  },
  ...overrides,
});

describe('collectValidLifetimeMemberships', () => {
  it('returns valid memberships when plan is configured', () => {
    const result = collectValidLifetimeMemberships([createMembership()], () =>
      createPlan()
    );

    expect(result.validMemberships).toEqual([
      { userId: 'user-1', priceId: 'price_lifetime' },
    ]);
    expect(result.shouldFallbackToFree).toBe(false);
    expect(result.invalidMemberships).toHaveLength(0);
  });

  it('falls back to free when no valid plan is found', () => {
    const result = collectValidLifetimeMemberships(
      [createMembership()],
      () => undefined
    );

    expect(result.validMemberships).toHaveLength(0);
    expect(result.shouldFallbackToFree).toBe(true);
    expect(result.invalidMemberships).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        priceId: 'price_lifetime',
      }),
    ]);
  });
});

describe('createCachedPlanResolver', () => {
  it('uses cache for repeated lookups', () => {
    const resolver = vi.fn().mockReturnValue(createPlan());
    const cachedResolver = createCachedPlanResolver(resolver);

    cachedResolver('price_lifetime');
    cachedResolver('price_lifetime');

    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
