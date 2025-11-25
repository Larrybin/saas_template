import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPlanCreditsConfigByPlanId,
  getPlanCreditsConfigByPriceId,
  getRegisterGiftCreditsConfig,
  type PlanCreditsConfig,
  type RegisterGiftCreditsConfig,
} from '@/credits/config';
import type { PricePlan } from '@/payment/types';
import { DefaultPlanCreditsPolicy } from '../plan-credits-policy';

vi.mock('@/credits/config', () => ({
  getRegisterGiftCreditsConfig: vi.fn(),
  getPlanCreditsConfigByPlanId: vi.fn(),
  getPlanCreditsConfigByPriceId: vi.fn(),
}));

const registerGiftMock = vi.mocked(getRegisterGiftCreditsConfig);
const planByPlanIdMock = vi.mocked(getPlanCreditsConfigByPlanId);
const planByPriceIdMock = vi.mocked(getPlanCreditsConfigByPriceId);

describe('DefaultPlanCreditsPolicy', () => {
  const policy = new DefaultPlanCreditsPolicy();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns register gift rule when enabled and amount > 0', () => {
    registerGiftMock.mockReturnValue({
      enabled: true,
      amount: 100,
      expireDays: 10,
    } as RegisterGiftCreditsConfig);

    expect(policy.getRegisterGiftRule()).toEqual({
      enabled: true,
      amount: 100,
      expireDays: 10,
    });
  });

  it('filters out disabled register gift rules', () => {
    registerGiftMock.mockReturnValue({
      enabled: false,
      amount: 100,
    } as RegisterGiftCreditsConfig);

    expect(policy.getRegisterGiftRule()).toBeNull();
  });

  it('filters out register gift rules with non-positive amount', () => {
    registerGiftMock.mockReturnValue({
      enabled: true,
      amount: 0,
    } as RegisterGiftCreditsConfig);

    expect(policy.getRegisterGiftRule()).toBeNull();
  });

  it('returns monthly free rule only for free plans', () => {
    const rule: PlanCreditsConfig = {
      enabled: true,
      amount: 50,
      isFree: true,
      isLifetime: false,
      disabled: false,
    };
    planByPlanIdMock.mockReturnValue(rule);

    expect(policy.getMonthlyFreeRule('free-plan')).toEqual(rule);
  });

  it('filters out disabled or non-free plans for monthly free rule', () => {
    planByPlanIdMock.mockReturnValue({
      enabled: true,
      amount: 50,
      isFree: false,
      isLifetime: false,
      disabled: false,
    } as PlanCreditsConfig);

    expect(policy.getMonthlyFreeRule('pro-plan')).toBeNull();

    planByPlanIdMock.mockReturnValue({
      enabled: true,
      amount: 50,
      isFree: false,
      isLifetime: false,
      disabled: true,
    } as PlanCreditsConfig);

    expect(policy.getMonthlyFreeRule('pro-plan')).toBeNull();
  });

  it('returns subscription renewal rule for non-lifetime plans', () => {
    const rule: PlanCreditsConfig = {
      enabled: true,
      amount: 100,
      isFree: false,
      isLifetime: false,
      disabled: false,
    };
    planByPriceIdMock.mockReturnValue(rule);

    expect(policy.getSubscriptionRenewalRule('price_pro')).toEqual(rule);
  });

  it('filters out lifetime plan from subscription renewal rule', () => {
    planByPriceIdMock.mockReturnValue({
      enabled: true,
      amount: 100,
      isFree: false,
      isLifetime: true,
      disabled: false,
    } as PlanCreditsConfig);

    expect(policy.getSubscriptionRenewalRule('price_lifetime')).toBeNull();
  });

  it('filters out disabled or zero-amount subscription renewal rules', () => {
    planByPriceIdMock.mockReturnValue({
      enabled: true,
      amount: 0,
      isFree: false,
      isLifetime: false,
      disabled: false,
    } as PlanCreditsConfig);

    expect(policy.getSubscriptionRenewalRule('price_zero_amount')).toBeNull();

    planByPriceIdMock.mockReturnValue({
      enabled: true,
      amount: 100,
      isFree: false,
      isLifetime: false,
      disabled: true,
    } as PlanCreditsConfig);

    expect(policy.getSubscriptionRenewalRule('price_disabled')).toBeNull();
  });

  it('returns lifetime rule only for lifetime plans', () => {
    const rule: PlanCreditsConfig = {
      enabled: true,
      amount: 200,
      isFree: false,
      isLifetime: true,
      disabled: false,
    };
    planByPriceIdMock.mockReturnValue(rule);

    expect(policy.getLifetimeMonthlyRule('price_lifetime')).toEqual(rule);
  });

  it('filters out disabled rules', () => {
    planByPriceIdMock.mockReturnValue({
      enabled: true,
      amount: 200,
      isFree: false,
      isLifetime: true,
      disabled: true,
    } as PlanCreditsConfig);

    expect(policy.getLifetimeMonthlyRule('price_lifetime')).toBeNull();
  });

  it('delegates resolveCurrentPlan to shared helper', () => {
    const plans: PricePlan[] = [
      {
        id: 'plan-free',
        prices: [],
        isFree: true,
        isLifetime: false,
      },
      {
        id: 'plan-lifetime',
        prices: [],
        isFree: false,
        isLifetime: true,
      },
    ];

    const result = policy.resolveCurrentPlan({
      plans,
      subscription: null,
      isLifetimeMember: true,
    });

    expect(result.currentPlan?.id).toBe('plan-lifetime');
    expect(result.subscription).toBeNull();
  });
});
