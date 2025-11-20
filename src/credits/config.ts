import { websiteConfig } from '@/config/website';
import { findPlanByPlanId, findPlanByPriceId } from '@/lib/price-plan';
import type { PricePlan } from '@/payment/types';

export type RegisterGiftCreditsConfig = {
  enabled: boolean;
  amount: number;
  expireDays?: number;
};

export type PlanCreditsConfig = {
  enabled: boolean;
  amount: number;
  expireDays?: number;
  isFree: boolean;
  isLifetime: boolean;
  disabled: boolean;
};

export function getRegisterGiftCreditsConfig(): RegisterGiftCreditsConfig | null {
  const cfg = websiteConfig.credits?.registerGiftCredits;
  if (!cfg) {
    return null;
  }

  const amount = cfg.amount ?? 0;
  const base: RegisterGiftCreditsConfig = {
    enabled: (cfg.enable ?? false) && amount > 0,
    amount,
  };

  if (cfg.expireDays === undefined) {
    return base;
  }

  return { ...base, expireDays: cfg.expireDays };
}

function mapPlanToCreditsConfig(plan: PricePlan): PlanCreditsConfig | null {
  const credits = plan.credits;
  if (!credits) {
    return null;
  }

  const amount = credits.amount ?? 0;
  const base: PlanCreditsConfig = {
    enabled: (credits.enable ?? false) && amount > 0,
    amount,
    isFree: plan.isFree ?? false,
    isLifetime: plan.isLifetime ?? false,
    disabled: plan.disabled ?? false,
  };

  if (credits.expireDays === undefined) {
    return base;
  }

  return { ...base, expireDays: credits.expireDays };
}

export function getPlanCreditsConfigByPlanId(
  planId: string
): PlanCreditsConfig | null {
  const plan = findPlanByPlanId(planId);
  if (!plan) {
    return null;
  }
  return mapPlanToCreditsConfig(plan);
}

export function getPlanCreditsConfigByPriceId(
  priceId: string
): PlanCreditsConfig | null {
  const plan = findPlanByPriceId(priceId);
  if (!plan) {
    return null;
  }
  return mapPlanToCreditsConfig(plan);
}
