import type { LifetimeMembershipRecord } from '@/payment/data-access/user-lifetime-membership-repository';
import type { PricePlan } from '@/payment/types';

export type PlanUserRecord = {
  userId: string;
  priceId: string;
};

export type PlanResolver = (
  priceId: string | null | undefined
) => PricePlan | undefined;

export type LifetimeMembershipResolution = {
  validMemberships: PlanUserRecord[];
  invalidMemberships: LifetimeMembershipRecord[];
  shouldFallbackToFree: boolean;
};

export function createCachedPlanResolver(
  resolver: (priceId: string) => PricePlan | undefined
): PlanResolver {
  const cache = new Map<string, PricePlan | undefined>();
  return (priceId) => {
    if (!priceId) {
      return undefined;
    }
    if (cache.has(priceId)) {
      return cache.get(priceId);
    }
    const plan = resolver(priceId);
    cache.set(priceId, plan);
    return plan;
  };
}

export function collectValidLifetimeMemberships(
  memberships: LifetimeMembershipRecord[] | undefined,
  resolvePlan: PlanResolver
): LifetimeMembershipResolution {
  if (!memberships || memberships.length === 0) {
    return {
      validMemberships: [],
      invalidMemberships: [],
      shouldFallbackToFree: false,
    };
  }

  const validMemberships: PlanUserRecord[] = [];
  const invalidMemberships: LifetimeMembershipRecord[] = [];

  memberships.forEach((membership) => {
    const plan = resolvePlan(membership.priceId);
    if (plan?.isLifetime && plan.credits?.enable) {
      validMemberships.push({
        userId: membership.userId,
        priceId: membership.priceId,
      });
      return;
    }

    invalidMemberships.push(membership);
  });

  return {
    validMemberships,
    invalidMemberships,
    shouldFallbackToFree: validMemberships.length === 0,
  };
}
