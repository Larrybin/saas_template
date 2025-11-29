import { websiteConfig } from '@/config/website';

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
    _context?: AiBillingContext
  ): AiBillingRule {
    const cfg = websiteConfig.ai?.billing?.[feature];

    if (!cfg) {
      return DEFAULT_RULE;
    }

    return {
      enabled: cfg.enabled ?? DEFAULT_RULE.enabled,
      creditsPerCall: cfg.creditsPerCall ?? DEFAULT_RULE.creditsPerCall,
      freeCallsPerPeriod:
        cfg.freeCallsPerPeriod ?? DEFAULT_RULE.freeCallsPerPeriod,
    };
  }
}

export const defaultAiBillingPolicy: AiBillingPolicy =
  new DefaultAiBillingPolicy();
