import {
  type AiBillingContext,
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

export function getAiChatBillingRule(
  context?: AiBillingContext
): AiBillingRule {
  return currentAiBillingPolicy.getChatRule(context);
}

export function getAnalyzeContentBillingRule(
  context?: AiBillingContext
): AiBillingRule {
  return currentAiBillingPolicy.getAnalyzeContentRule(context);
}

export function getImageGenerateBillingRule(
  context?: AiBillingContext
): AiBillingRule {
  return currentAiBillingPolicy.getImageRule(context);
}
