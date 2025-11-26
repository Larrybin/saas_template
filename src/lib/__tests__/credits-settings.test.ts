import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/website', () => ({
  websiteConfig: {
    credits: {
      enableCredits: true,
      enablePackagesForFreePlan: false,
    },
  },
}));

const mockRegisterGiftConfig = {
  enabled: true,
  amount: 100,
  expireDays: 10,
};

vi.mock('@/credits/config', () => ({
  getRegisterGiftCreditsConfig: vi.fn(() => mockRegisterGiftConfig),
}));

import { getCreditsGlobalConfig, isCreditsEnabled } from '../credits-settings';

describe('credits-settings', () => {
  it('returns credits enabled flag from websiteConfig', () => {
    expect(isCreditsEnabled()).toBe(true);
  });

  it('returns global config with register gift config', () => {
    const config = getCreditsGlobalConfig();

    expect(config.enableCredits).toBe(true);
    expect(config.enablePackagesForFreePlan).toBe(false);
    expect(config.registerGift).toEqual(mockRegisterGiftConfig);
  });
});
