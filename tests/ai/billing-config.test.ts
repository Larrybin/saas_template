import { describe, expect, it } from 'vitest';
import { getAiChatBillingRule } from '@/ai/billing-config';
import {
  type AiBillingRule,
  defaultAiBillingPolicy,
} from '@/ai/billing-policy';
import { withTestAiBillingPolicy } from '../utils/ai-billing-policy';

describe('AI billing config injection', () => {
  function expectRule(rule: AiBillingRule, expected: AiBillingRule) {
    expect(rule.enabled).toBe(expected.enabled);
    expect(rule.creditsPerCall).toBe(expected.creditsPerCall);
    expect(rule.freeCallsPerPeriod).toBe(expected.freeCallsPerPeriod);
  }

  it('uses default policy by default', () => {
    // 确保初始策略为默认策略
    expect(getAiChatBillingRule()).toEqual(
      defaultAiBillingPolicy.getChatRule()
    );
  });

  it('allows replacing billing policy for callers', async () => {
    const customRule: AiBillingRule = {
      enabled: true,
      creditsPerCall: 5,
      freeCallsPerPeriod: 0,
    };

    const customPolicy = {
      getChatRule: () => customRule,
      getAnalyzeContentRule: () => customRule,
      getImageRule: () => customRule,
    };

    await withTestAiBillingPolicy(customPolicy, async () => {
      const rule = getAiChatBillingRule();
      expectRule(rule, customRule);
    });
  });
});
