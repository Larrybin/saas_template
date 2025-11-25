import { PlanIntervals } from '@/payment/types';
import type {
  LifetimeMembershipResolution,
  PlanResolver,
  PlanUserRecord,
} from './lifetime-membership';

export type UserBillingSnapshot = {
  userId: string;
  email: string | null;
  name: string | null;
  priceId: string | null;
  paymentStatus: string | null;
  paymentCreatedAt: Date | null;
};

export type MisconfiguredPaidUser = {
  userId: string;
  priceId: string;
};

export function classifyUsersByPlan(
  userBatch: UserBillingSnapshot[],
  membershipsByUser: Map<string, LifetimeMembershipResolution>,
  resolvePlan: PlanResolver
) {
  const freeUserIds: string[] = [];
  const lifetimeUsers: PlanUserRecord[] = [];
  const yearlyUsers: PlanUserRecord[] = [];
  const misconfiguredPaidUsers: MisconfiguredPaidUser[] = [];

  userBatch.forEach((userRecord) => {
    const membershipResult = membershipsByUser.get(userRecord.userId);
    if (membershipResult) {
      if (membershipResult.validMemberships.length > 0) {
        lifetimeUsers.push(...membershipResult.validMemberships);
      }
      if (
        membershipResult.invalidMemberships.length > 0 &&
        membershipResult.shouldFallbackToFree
      ) {
        freeUserIds.push(userRecord.userId);
      }
      return;
    }

    if (
      userRecord.priceId &&
      userRecord.paymentStatus &&
      (userRecord.paymentStatus === 'active' ||
        userRecord.paymentStatus === 'trialing')
    ) {
      const pricePlan = resolvePlan(userRecord.priceId);
      if (pricePlan?.isLifetime && pricePlan?.credits?.enable) {
        lifetimeUsers.push({
          userId: userRecord.userId,
          priceId: userRecord.priceId,
        });
      } else if (!pricePlan?.isFree && pricePlan?.credits?.enable) {
        const yearlyPrice = pricePlan?.prices?.find(
          (p) =>
            p.priceId === userRecord.priceId &&
            p.interval === PlanIntervals.YEAR
        );
        if (yearlyPrice) {
          yearlyUsers.push({
            userId: userRecord.userId,
            priceId: userRecord.priceId,
          });
        } else {
          misconfiguredPaidUsers.push({
            userId: userRecord.userId,
            priceId: userRecord.priceId,
          });
          freeUserIds.push(userRecord.userId);
        }
      }
    } else {
      freeUserIds.push(userRecord.userId);
    }
  });

  return { freeUserIds, lifetimeUsers, yearlyUsers, misconfiguredPaidUsers };
}

