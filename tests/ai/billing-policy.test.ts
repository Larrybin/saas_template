import { describe, expect, it } from 'vitest';
import {
  type AiBillingRule,
  DefaultAiBillingPolicy,
} from '@/ai/billing-policy';
import { websiteConfig } from '@/config/website';

describe('DefaultAiBillingPolicy', () => {
  const policy = new DefaultAiBillingPolicy();

  function expectRule(rule: AiBillingRule, expected: AiBillingRule) {
    expect(rule.enabled).toBe(expected.enabled);
    expect(rule.creditsPerCall).toBe(expected.creditsPerCall);
    expect(rule.freeCallsPerPeriod).toBe(expected.freeCallsPerPeriod);
  }

  it('uses websiteConfig.ai.billing.* when present', () => {
    const original = websiteConfig.ai;

    (websiteConfig as any).ai = {
      billing: {
        chat: {
          enabled: false,
          creditsPerCall: 3,
          freeCallsPerPeriod: 5,
        },
      },
    };

    try {
      const rule = policy.getChatRule();
      expectRule(rule, {
        enabled: false,
        creditsPerCall: 3,
        freeCallsPerPeriod: 5,
      });
    } finally {
      (websiteConfig as any).ai = original;
    }
  });

  it('falls back to default rule when config is missing', () => {
    const original = websiteConfig.ai;

    (websiteConfig as any).ai = undefined;

    try {
      const rule = policy.getChatRule();
      expectRule(rule, {
        enabled: true,
        creditsPerCall: 1,
        freeCallsPerPeriod: 8,
      });
    } finally {
      (websiteConfig as any).ai = original;
    }
  });
});
