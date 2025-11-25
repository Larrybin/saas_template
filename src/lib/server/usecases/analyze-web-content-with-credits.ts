import 'server-only';

import { getAnalyzeContentBillingRule } from '@/ai/billing-config';
import type {
  AnalyzeContentHandlerInput,
  AnalyzeContentHandlerResult,
  ValidatedAnalyzeRequest,
} from '@/ai/text/utils/analyze-content-handler';
import {
  handleAnalyzeContentRequest,
  preflightAnalyzeContentRequest,
} from '@/ai/text/utils/analyze-content-handler';
import {
  ErrorSeverity,
  ErrorType,
  WebContentAnalyzerError,
} from '@/ai/text/utils/error-handling';
import {
  AI_USAGE_FEATURE,
  incrementAiUsageAndCheckWithinFreeQuota,
} from '@/ai/usage/ai-usage-service';
import { consumeCredits } from '@/credits/credits';
import { getLogger } from '@/lib/server/logger';

export type AnalyzeWebContentWithCreditsInput = {
  userId: string;
  body: unknown;
  requestId: string;
  requestUrl: string;
  requiredCredits?: number;
};

/**
 * Use Case: 分析网页内容并进行积分扣费。
 *
 * 责任：
 * - 在调用 WebContentAnalyzer 前先扣除指定的积分（默认 1）。
 * - 调用 `handleAnalyzeContentRequest` 执行抓取与分析，返回标准结果。
 *
 * 错误处理：
 * - 积分不足等 Credits 域错误会通过 `consumeCredits` 抛出 DomainError，
 *   由调用方（API Route / safe-action）负责封装为 HTTP envelope。
 * - WebContentAnalyzer 内部的 DomainError 会在 `handleAnalyzeContentRequest`
 *   内部被捕获并转换为 `{ status, response }` 结果。
 */
export async function analyzeWebContentWithCredits(
  input: AnalyzeWebContentWithCreditsInput
): Promise<AnalyzeContentHandlerResult> {
  const { userId, body, requestId, requestUrl, requiredCredits } = input;
  if (!body) {
    const validationError = new WebContentAnalyzerError(
      ErrorType.VALIDATION,
      'Request body is required',
      'Please provide a valid request body.',
      ErrorSeverity.MEDIUM,
      false
    );

    return {
      status: 400,
      response: {
        success: false,
        error: validationError.userMessage,
        code: validationError.code,
        retryable: validationError.retryable,
      },
    };
  }

  const preflight = preflightAnalyzeContentRequest({ body, requestId });
  if (!preflight.ok) {
    return preflight.result;
  }
  const validatedRequest: ValidatedAnalyzeRequest = preflight.data;

  const billingRule = getAnalyzeContentBillingRule();
  const creditsToConsume =
    typeof requiredCredits === 'number'
      ? requiredCredits
      : billingRule.creditsPerCall;

  const logger = getLogger({
    span: 'usecase.ai.text.analyze-with-credits',
    userId,
    requestId,
  });

  logger.info(
    { userId, creditsPerCall: creditsToConsume },
    'Starting web content analysis with billing'
  );

  const freeCallsPerPeriod = billingRule.freeCallsPerPeriod ?? 0;
  const withinFreeQuota =
    freeCallsPerPeriod > 0
      ? await incrementAiUsageAndCheckWithinFreeQuota({
          userId,
          feature: AI_USAGE_FEATURE.analyzeContent,
          freeCallsPerPeriod,
        })
      : false;

  if (withinFreeQuota) {
    logger.info(
      { userId },
      'Web content analysis within free quota, skipping credits consumption'
    );
  } else {
    await consumeCredits({
      userId,
      amount: creditsToConsume,
      description: `AI web content analysis (${creditsToConsume} credits)`,
    });
  }

  logger.info(
    { userId, requestUrl },
    'Credits deducted, invoking web content analyzer'
  );

  const startTime = performance.now();

  const handlerInput: AnalyzeContentHandlerInput = {
    requestId,
    requestUrl,
    startTime,
    validatedRequest,
  };

  const result = await handleAnalyzeContentRequest(handlerInput);
  return result;
}
