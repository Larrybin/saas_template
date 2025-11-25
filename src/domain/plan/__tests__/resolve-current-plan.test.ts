import { describe, expect, it } from 'vitest';
import type { PricePlan, Subscription } from '@/payment/types';
import { PaymentTypes, PlanIntervals } from '@/payment/types';
import { resolveCurrentPlan } from '../resolve-current-plan';

const basePlan: PricePlan = {
  id: 'plan-free',
  name: 'Free',
  description: '',
  prices: [],
  isFree: true,
  isLifetime: false,
  credits: {
    enable: true,
    amount: 10,
  },
};

const lifetimePlan: PricePlan = {
  ...basePlan,
  id: 'plan-lifetime',
  isFree: false,
  isLifetime: true,
};

const paidPlan: PricePlan = {
  ...basePlan,
  id: 'plan-pro',
  isFree: false,
  prices: [
    {
      type: PaymentTypes.SUBSCRIPTION,
      priceId: 'price_pro',
      amount: 1000,
      currency: 'usd',
      interval: PlanIntervals.MONTH,
    },
  ],
};

const disabledPlan: PricePlan = {
  ...paidPlan,
  id: 'plan-disabled',
  disabled: true,
  prices: [
    {
      type: PaymentTypes.SUBSCRIPTION,
      priceId: 'price_disabled',
      amount: 2000,
      currency: 'usd',
      interval: PlanIntervals.MONTH,
    },
  ],
};

const subscription: Subscription = {
  id: 'sub_1',
  customerId: 'cus_1',
  status: 'active',
  priceId: 'price_pro',
  type: PaymentTypes.SUBSCRIPTION,
  interval: PlanIntervals.MONTH,
  createdAt: new Date(),
};

describe('resolveCurrentPlan', () => {
  it('returns lifetime plan when user is lifetime member', () => {
    const result = resolveCurrentPlan({
      plans: [basePlan, lifetimePlan, paidPlan],
      subscription,
      isLifetimeMember: true,
    });

    expect(result.currentPlan?.id).toBe('plan-lifetime');
    expect(result.subscription).toBeNull();
  });

  it('falls back to subscription plan when not lifetime member', () => {
    const result = resolveCurrentPlan({
      plans: [basePlan, lifetimePlan, paidPlan],
      subscription,
      isLifetimeMember: false,
    });

    expect(result.currentPlan?.id).toBe('plan-pro');
    expect(result.subscription).toEqual(subscription);
  });

  it('ignores disabled plans when resolving subscription', () => {
    const result = resolveCurrentPlan({
      plans: [basePlan, disabledPlan],
      subscription: {
        ...subscription,
        priceId: 'price_disabled',
      },
      isLifetimeMember: false,
    });

    expect(result.currentPlan).toBeNull();
    expect(result.subscription).not.toBeNull();
  });

  it('returns free plan when no subscription', () => {
    const result = resolveCurrentPlan({
      plans: [basePlan, paidPlan],
      subscription: null,
      isLifetimeMember: false,
    });

    expect(result.currentPlan?.id).toBe('plan-free');
    expect(result.subscription).toBeNull();
  });

  it('returns null when no matching plans are available', () => {
    const result = resolveCurrentPlan({
      plans: [disabledPlan],
      subscription: null,
      isLifetimeMember: false,
    });

    expect(result.currentPlan).toBeNull();
    expect(result.subscription).toBeNull();
  });
});
