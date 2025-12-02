import {
  type AiBillingPolicy,
  type AiBillingRule,
  defaultAiBillingPolicy,
} from '@/ai/billing-policy';

let currentAiBillingPolicy: AiBillingPolicy = defaultAiBillingPolicy;

export function setAiBillingPolicy(policy: AiBillingPolicy): void {
  currentAiBillingPolicy = policy;
}

export function getAiBillingPolicy(): AiBillingPolicy {
  return currentAiBillingPolicy;
}

export function getAiChatBillingRule(): AiBillingRule {
  return currentAiBillingPolicy.getChatRule();
}

export function getAnalyzeContentBillingRule(): AiBillingRule {
  return currentAiBillingPolicy.getAnalyzeContentRule();
}

export function getImageGenerateBillingRule(): AiBillingRule {
  return currentAiBillingPolicy.getImageRule();
}
