import {
  getPlanCreditsConfigByPlanId,
  getPlanCreditsConfigByPriceId,
  type PlanCreditsConfig,
} from '@/credits/config';
import { findPlanByPlanId, findPlanByPriceId } from '@/lib/price-plan';
import type { PricePlan } from '@/payment/types';

export interface PlanPolicy {
  getPlanById: (planId: string) => PricePlan | undefined;
  getPlanByPriceId: (priceId: string) => PricePlan | undefined;
  getPlanCreditsConfigByPlanId: (
    planId: string
  ) => PlanCreditsConfig | null;
  getPlanCreditsConfigByPriceId: (
    priceId: string
  ) => PlanCreditsConfig | null;
}

export class DefaultPlanPolicy implements PlanPolicy {
  getPlanById(planId: string): PricePlan | undefined {
    return findPlanByPlanId(planId);
  }

  getPlanByPriceId(priceId: string): PricePlan | undefined {
    return findPlanByPriceId(priceId);
  }

  getPlanCreditsConfigByPlanId(planId: string): PlanCreditsConfig | null {
    return getPlanCreditsConfigByPlanId(planId);
  }

  getPlanCreditsConfigByPriceId(priceId: string): PlanCreditsConfig | null {
    return getPlanCreditsConfigByPriceId(priceId);
  }
}
