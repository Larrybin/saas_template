import {
  type AiBillingRule,
  defaultAiBillingPolicy,
} from '@/ai/billing-policy';

export function getAiChatBillingRule(): AiBillingRule {
  return defaultAiBillingPolicy.getChatRule();
}

export function getAnalyzeContentBillingRule(): AiBillingRule {
  return defaultAiBillingPolicy.getAnalyzeContentRule();
}

export function getImageGenerateBillingRule(): AiBillingRule {
  return defaultAiBillingPolicy.getImageRule();
}
