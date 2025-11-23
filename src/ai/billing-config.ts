export type AiBillingRule = {
  enabled: boolean;
  creditsPerCall: number;
  /**
   * 每个周期内的免费调用次数（按用户 + 功能）
   */
  freeCallsPerPeriod: number;
};

const aiBillingConfig = {
  chat: {
    enabled: true,
    creditsPerCall: 1,
    freeCallsPerPeriod: 8,
  },
  analyzeContent: {
    enabled: true,
    creditsPerCall: 1,
    freeCallsPerPeriod: 8,
  },
  generateImage: {
    enabled: true,
    creditsPerCall: 1,
    freeCallsPerPeriod: 8,
  },
} as const satisfies Record<string, AiBillingRule>;

export function getAiChatBillingRule(): AiBillingRule {
  return aiBillingConfig.chat;
}

export function getAnalyzeContentBillingRule(): AiBillingRule {
  return aiBillingConfig.analyzeContent;
}

export function getImageGenerateBillingRule(): AiBillingRule {
  return aiBillingConfig.generateImage;
}
