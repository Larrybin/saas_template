import { describe, expect, it } from 'vitest';
import { aiConfigProvider } from '@/ai/ai-config-provider';
import { websiteConfig } from '@/config/website';

describe('AiConfigProvider', () => {
  it('returns websiteConfig.ai.billing as is', () => {
    const original = websiteConfig.ai?.billing;

    const result = aiConfigProvider.getBillingConfig();

    expect(result).toBe(original);
  });
});
