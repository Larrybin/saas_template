import { websiteConfig } from '@/config/website';
import type { AiBillingConfig } from '@/types';

/**
 * AI 配置 Provider 抽象
 *
 * 当前只负责提供计费配置 `websiteConfig.ai.billing`，
 * 未来如需按 plan/region/tenant 定制，可在此处扩展而不影响 usecase 与策略层。
 */
export interface AiConfigProvider {
  getBillingConfig(): AiBillingConfig | undefined;
}

class DefaultAiConfigProvider implements AiConfigProvider {
  getBillingConfig(): AiBillingConfig | undefined {
    return websiteConfig.ai?.billing;
  }
}

export const aiConfigProvider: AiConfigProvider = new DefaultAiConfigProvider();
