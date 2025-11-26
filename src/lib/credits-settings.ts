import { websiteConfig } from '@/config/website';
import {
  getRegisterGiftCreditsConfig,
  type RegisterGiftCreditsConfig,
} from '@/credits/config';

export type CreditsGlobalConfig = {
  enableCredits: boolean;
  enablePackagesForFreePlan: boolean;
  registerGift: RegisterGiftCreditsConfig | null;
};

export function isCreditsEnabled(): boolean {
  return websiteConfig.credits.enableCredits;
}

export function getCreditsGlobalConfig(): CreditsGlobalConfig {
  return {
    enableCredits: websiteConfig.credits.enableCredits,
    enablePackagesForFreePlan: websiteConfig.credits.enablePackagesForFreePlan,
    registerGift: getRegisterGiftCreditsConfig(),
  };
}
