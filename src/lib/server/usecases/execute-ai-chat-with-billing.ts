import 'server-only';

import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { getAiChatBillingRule } from '@/ai/billing-config';
import {
  AI_USAGE_FEATURE,
  incrementAiUsageAndCheckWithinFreeQuota,
} from '@/ai/usage/ai-usage-service';
import { consumeCredits } from '@/credits/credits';
import { getLogger } from '@/lib/server/logger';

export type ExecuteAiChatWithBillingInput = {
  userId: string;
  messages: UIMessage[];
  model: string;
  webSearch: boolean;
  /**
   * 每次调用消耗的积分数量，默认 1。
   * 可根据业务需要在上层调用处调整。
   */
  requiredCredits?: number;
};

export type ExecuteAiChatWithBillingResult = ReturnType<typeof streamText>;

/**
 * Use Case: 执行一次 AI Chat 调用并进行积分扣费。
 *
 * 责任：
 * - 按调用前先扣除指定数量的积分（默认 1），不足时抛出 DomainError（CREDITS_INSUFFICIENT_BALANCE）。
 * - 构造并返回 ai.streamText 的结果，由调用方负责将其转换为 HTTP 响应（例如 toUIMessageStreamResponse）。
 *
 * 约定：
 * - 建议在调用此 use case 之前，由 API Route / Server Action 使用 withLogContext
 *   注入 requestId / userId 等上下文，以便日志串联：
 *
 *   await withLogContext({ requestId, userId }, () =>
 *     executeAiChatWithBilling({...})
 *   );
 *
 * - 本函数内部通过 getLogger({ span: 'usecase.ai.chat-with-billing', userId })
 *   记录关键业务事件（积分扣费、调用开始等）。
 */
export async function executeAiChatWithBilling(
  input: ExecuteAiChatWithBillingInput
): Promise<ExecuteAiChatWithBillingResult> {
  const { userId, messages, model, webSearch, requiredCredits } = input;

  const billingRule = getAiChatBillingRule();
  const creditsToConsume =
    typeof requiredCredits === 'number'
      ? requiredCredits
      : billingRule.creditsPerCall;

  const logger = getLogger({
    span: 'usecase.ai.chat-with-billing',
    userId,
  });

  logger.info(
    { userId, creditsPerCall: creditsToConsume },
    'Starting AI chat with billing'
  );

  const freeCallsPerPeriod = billingRule.freeCallsPerPeriod ?? 0;
  const withinFreeQuota =
    freeCallsPerPeriod > 0
      ? await incrementAiUsageAndCheckWithinFreeQuota({
          userId,
          feature: AI_USAGE_FEATURE.chat,
          freeCallsPerPeriod,
        })
      : false;

  if (withinFreeQuota) {
    logger.info(
      { userId },
      'AI chat usage within free quota, skipping credits consumption'
    );
  } else {
    // 扣除本次调用所需的积分。
    // 若积分不足，将抛出 InsufficientCreditsError（DomainError），由上层统一封装返回。
    await consumeCredits({
      userId,
      amount: creditsToConsume,
      description: `AI chat usage (${creditsToConsume} credits)`,
    });
  }

  logger.info(
    { userId, model, webSearch },
    'Credits deducted, invoking AI chat'
  );

  const result = streamText({
    model: webSearch ? 'perplexity/sonar' : model,
    messages: convertToModelMessages(messages),
    system:
      'You are a helpful assistant that can answer questions and help with tasks',
  });

  return result;
}
