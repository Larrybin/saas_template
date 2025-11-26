import {
  addMonthlyFreeCredits,
  addRegisterGiftCredits,
} from '@/credits/credits';
import {
  getCreditsGlobalConfig,
  isCreditsEnabled,
} from '@/lib/credits-settings';
import { getAllPricePlans } from '@/lib/price-plan';
import { getLogger } from '@/lib/server/logger';
import type { UserLifecycleHook } from '../types';

const logger = getLogger({ span: 'user-lifecycle.credits' });

export function createRegisterGiftCreditsHook(): UserLifecycleHook<'user.created'> {
  return async ({ user }) => {
    const creditsConfig = getCreditsGlobalConfig();

    if (
      !creditsConfig.enableCredits ||
      !creditsConfig.registerGift ||
      !creditsConfig.registerGift.enabled ||
      creditsConfig.registerGift.amount <= 0
    ) {
      return;
    }

    try {
      await addRegisterGiftCredits(user.id);
      logger.info({ userId: user.id }, 'Added register gift credits');
    } catch (error) {
      logger.error({ error, userId: user.id }, 'Register gift credits error');
    }
  };
}

export function createMonthlyFreeCreditsHook(): UserLifecycleHook<'user.created'> {
  return async ({ user }) => {
    if (!isCreditsEnabled()) {
      return;
    }

    const pricePlans = getAllPricePlans();
    const freePlan = pricePlans.find(
      (plan) => plan.isFree && !plan.disabled && plan.credits?.enable
    );

    if (!freePlan) {
      return;
    }

    try {
      await addMonthlyFreeCredits(user.id, freePlan.id);
      logger.info({ userId: user.id }, 'Added free monthly credits');
    } catch (error) {
      logger.error({ error, userId: user.id }, 'Free monthly credits error');
    }
  };
}
