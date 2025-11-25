import type { PricePlan, Subscription } from '@/payment/types';

export type ResolveCurrentPlanInput = {
  plans: PricePlan[];
  subscription: Subscription | null;
  isLifetimeMember: boolean;
};

export type ResolvedPlan = {
  currentPlan: PricePlan | null;
  subscription: Subscription | null;
};

export function resolveCurrentPlan({
  plans,
  subscription,
  isLifetimeMember,
}: ResolveCurrentPlanInput): ResolvedPlan {
  const availablePlans = plans.filter((plan) => !(plan.disabled ?? false));

  const freePlan = availablePlans.find((plan) => plan.isFree) ?? null;
  const lifetimePlan = availablePlans.find((plan) => plan.isLifetime) ?? null;

  if (isLifetimeMember) {
    return {
      currentPlan: lifetimePlan ?? null,
      subscription: null,
    };
  }

  if (subscription) {
    const matchedPlan =
      availablePlans.find((plan) =>
        plan.prices?.some((price) => price.priceId === subscription.priceId)
      ) ?? null;
    return {
      currentPlan: matchedPlan,
      subscription,
    };
  }

  return {
    currentPlan: freePlan,
    subscription: null,
  };
}
