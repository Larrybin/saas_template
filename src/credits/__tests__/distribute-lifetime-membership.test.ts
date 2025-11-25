import { describe, expect, it, vi } from 'vitest';
import {
  classifyUsersByPlan,
  collectValidLifetimeMemberships,
  createCachedPlanResolver,
} from '@/credits/distribute';
import type { LifetimeMembershipRecord } from '@/payment/data-access/user-lifetime-membership-repository';
import { PlanIntervals, type PricePlan } from '@/payment/types';

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

describe('classifyUsersByPlan', () => {
  it('uses lifetime membership resolution when available', () => {
    const userBatch = [
      {
        userId: 'user-1',
        email: 'user@example.com',
        name: 'User 1',
        priceId: 'price_subscription',
        paymentStatus: 'active',
        paymentCreatedAt: new Date('2024-01-01T00:00:00Z'),
      },
    ];

    const membershipsByUser = new Map([
      [
        'user-1',
        {
          validMemberships: [{ userId: 'user-1', priceId: 'price_lifetime' }],
          invalidMemberships: [],
          shouldFallbackToFree: false,
        },
      ],
    ]);

    const resolver = vi.fn();

    const result = classifyUsersByPlan(
      userBatch as any,
      membershipsByUser,
      resolver
    );

    expect(result.lifetimeUsers).toEqual([
      { userId: 'user-1', priceId: 'price_lifetime' },
    ]);
    expect(result.freeUserIds).toHaveLength(0);
    expect(result.yearlyUsers).toHaveLength(0);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('falls back to free users when membership suggests fallback', () => {
    const userBatch = [
      {
        userId: 'user-2',
        email: null,
        name: null,
        priceId: null,
        paymentStatus: null,
        paymentCreatedAt: null,
      },
    ];

    const membershipsByUser = new Map([
      [
        'user-2',
        {
          validMemberships: [],
          invalidMemberships: [
            {
              id: 'mem-2',
              userId: 'user-2',
              priceId: 'price_lifetime_invalid',
              cycleRefDate: new Date('2024-01-01T00:00:00Z'),
              createdAt: new Date('2024-01-01T00:00:00Z'),
              updatedAt: new Date('2024-01-01T00:00:00Z'),
              revokedAt: null,
            },
          ],
          shouldFallbackToFree: true,
        },
      ],
    ]);

    const resolver = vi.fn();

    const result = classifyUsersByPlan(
      userBatch as any,
      membershipsByUser,
      resolver
    );

    expect(result.freeUserIds).toEqual(['user-2']);
    expect(result.lifetimeUsers).toHaveLength(0);
    expect(result.yearlyUsers).toHaveLength(0);
  });

  it('classifies users based on subscription plans when no membership is present', () => {
    const lifetimePlan = createPlan();
    const yearlyPlan = createPlan({
      isLifetime: false,
      isFree: false,
      credits: {
        enable: true,
        amount: 200,
      },
      prices: [
        {
          priceId: 'price_yearly',
          interval: PlanIntervals.YEAR,
        } as any,
      ],
    });

    const resolver = (priceId: string | null | undefined) => {
      if (priceId === 'price_lifetime') {
        return lifetimePlan;
      }
      if (priceId === 'price_yearly') {
        return yearlyPlan;
      }
      return undefined;
    };

    const userBatch = [
      {
        userId: 'user-lifetime',
        email: null,
        name: null,
        priceId: 'price_lifetime',
        paymentStatus: 'active',
        paymentCreatedAt: new Date('2024-01-01T00:00:00Z'),
      },
      {
        userId: 'user-yearly',
        email: null,
        name: null,
        priceId: 'price_yearly',
        paymentStatus: 'active',
        paymentCreatedAt: new Date('2024-01-01T00:00:00Z'),
      },
      {
        userId: 'user-free',
        email: null,
        name: null,
        priceId: null,
        paymentStatus: null,
        paymentCreatedAt: null,
      },
    ];

    const membershipsByUser = new Map<string, any>();

    const result = classifyUsersByPlan(
      userBatch as any,
      membershipsByUser,
      resolver
    );

    expect(result.lifetimeUsers).toEqual([
      { userId: 'user-lifetime', priceId: 'price_lifetime' },
    ]);
    expect(result.yearlyUsers).toEqual([
      { userId: 'user-yearly', priceId: 'price_yearly' },
    ]);
    expect(result.freeUserIds).toContain('user-free');
  });
});
