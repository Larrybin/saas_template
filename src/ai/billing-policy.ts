import { aiConfigProvider } from '@/ai/ai-config-provider';
import type { AiBillingRuleConfig, AiBillingRuleOverrideConfig } from '@/types';

export type AiBillingRule = {
  enabled: boolean;
  creditsPerCall: number;
  /**
   * 每个周期内的免费调用次数（按用户 + 功能）
   */
  freeCallsPerPeriod: number;
};

export type AiBillingFeature = 'chat' | 'analyzeContent' | 'generateImage';

export type AiBillingEnvironment = 'local' | 'preview' | 'production';

export type AiBillingContext = {
  planId?: string;
  region?: string;
  environment?: AiBillingEnvironment;
};

export interface AiBillingPolicy {
  getChatRule(context?: AiBillingContext): AiBillingRule;
  getAnalyzeContentRule(context?: AiBillingContext): AiBillingRule;
  getImageRule(context?: AiBillingContext): AiBillingRule;
}

const DEFAULT_RULE: AiBillingRule = {
  enabled: true,
  creditsPerCall: 1,
  freeCallsPerPeriod: 8,
};

function resolveEffectiveRuleFromConfig(
  config: AiBillingRuleConfig | undefined,
  context?: AiBillingContext
): AiBillingRule {
  if (!config) {
    return DEFAULT_RULE;
  }

  const base: AiBillingRule = {
    enabled: config.enabled ?? DEFAULT_RULE.enabled,
    creditsPerCall: config.creditsPerCall ?? DEFAULT_RULE.creditsPerCall,
    freeCallsPerPeriod:
      config.freeCallsPerPeriod ?? DEFAULT_RULE.freeCallsPerPeriod,
  };

  const overrides = config.rules;
  if (!overrides || overrides.length === 0 || !context) {
    return base;
  }

  const { planId, region } = context;

  let bestOverride: AiBillingRuleOverrideConfig | undefined;
  let bestScore = -1;

  for (const override of overrides) {
    // 若配置了 planId/region，则与上下文不匹配时直接跳过。
    if (override.planId && override.planId !== planId) continue;
    if (override.region && override.region !== region) continue;

    let score = 0;
    if (override.planId) score += 2;
    if (override.region) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestOverride = override;
    }
  }

  if (!bestOverride) {
    return base;
  }

  return {
    enabled: bestOverride.enabled ?? base.enabled,
    creditsPerCall: bestOverride.creditsPerCall ?? base.creditsPerCall,
    freeCallsPerPeriod:
      bestOverride.freeCallsPerPeriod ?? base.freeCallsPerPeriod,
  };
}

export class DefaultAiBillingPolicy implements AiBillingPolicy {
  getChatRule(context?: AiBillingContext): AiBillingRule {
    return this.resolveRule('chat', context);
  }

  getAnalyzeContentRule(context?: AiBillingContext): AiBillingRule {
    return this.resolveRule('analyzeContent', context);
  }

  getImageRule(context?: AiBillingContext): AiBillingRule {
    return this.resolveRule('generateImage', context);
  }

  private resolveRule(
    feature: AiBillingFeature,
    context?: AiBillingContext
  ): AiBillingRule {
    const billingConfig = aiConfigProvider.getBillingConfig();
    const cfg = billingConfig?.[feature];

    return resolveEffectiveRuleFromConfig(cfg, context);
  }
}

export const defaultAiBillingPolicy: AiBillingPolicy =
  new DefaultAiBillingPolicy();
