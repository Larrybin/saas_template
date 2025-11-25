import {
  getPlanCreditsConfigByPlanId,
  getPlanCreditsConfigByPriceId,
  getRegisterGiftCreditsConfig,
  type PlanCreditsConfig,
  type RegisterGiftCreditsConfig,
} from '@/credits/config';
import {
  type ResolveCurrentPlanInput,
  type ResolvedPlan,
  resolveCurrentPlan,
} from '@/domain/plan/resolve-current-plan';
import { getAllPricePlans } from '@/lib/price-plan';
import type { PricePlan, Subscription } from '@/payment/types';

export type PlanCreditsRule = PlanCreditsConfig;

export interface PlanCreditsPolicy {
  getRegisterGiftRule(): RegisterGiftCreditsConfig | null;
  getMonthlyFreeRule(planId: string): PlanCreditsRule | null;
  getSubscriptionRenewalRule(priceId: string): PlanCreditsRule | null;
  getLifetimeMonthlyRule(priceId: string): PlanCreditsRule | null;
  resolveCurrentPlan(input: ResolveCurrentPlanInput): ResolvedPlan;
}

export class DefaultPlanCreditsPolicy implements PlanCreditsPolicy {
  getRegisterGiftRule(): RegisterGiftCreditsConfig | null {
    const rule = getRegisterGiftCreditsConfig();
    if (!rule || !rule.enabled || rule.amount <= 0) {
      return null;
    }
    return rule;
  }

  getMonthlyFreeRule(planId: string): PlanCreditsRule | null {
    return this.normalizeRule(getPlanCreditsConfigByPlanId(planId), {
      requireFree: true,
    });
  }

  getSubscriptionRenewalRule(priceId: string): PlanCreditsRule | null {
    return this.normalizeRule(getPlanCreditsConfigByPriceId(priceId), {
      requireLifetime: false,
      requireFree: false,
    });
  }

  getLifetimeMonthlyRule(priceId: string): PlanCreditsRule | null {
    return this.normalizeRule(getPlanCreditsConfigByPriceId(priceId), {
      requireLifetime: true,
    });
  }

  resolveCurrentPlan(input: ResolveCurrentPlanInput): ResolvedPlan {
    const plans = input.plans ?? getAllPricePlans();
    return resolveCurrentPlan({
      ...input,
      plans,
    });
  }

  private normalizeRule(
    rule: PlanCreditsRule | null,
    options?: { requireLifetime?: boolean; requireFree?: boolean }
  ): PlanCreditsRule | null {
    if (!rule || !rule.enabled || rule.amount <= 0) {
      return null;
    }
    if (rule.disabled) {
      return null;
    }
    if (options?.requireLifetime && !rule.isLifetime) {
      return null;
    }
    if (options?.requireFree && !rule.isFree) {
      return null;
    }
    if (options?.requireLifetime === false && rule.isLifetime) {
      // subscription renewal规则不应返回终身计划
      return null;
    }
    if (options?.requireFree === false && rule.isFree) {
      return null;
    }
    return rule;
  }
}

export type { ResolveCurrentPlanInput, ResolvedPlan, Subscription, PricePlan };
