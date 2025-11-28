import { NextResponse } from 'next/server';

import {
  ErrorSeverity,
  ErrorType,
  WebContentAnalyzerError,
} from '@/ai/text/utils/error-handling';
import { logAnalyzerErrorServer } from '@/ai/text/utils/error-logging.server';
import type { AnalyzeContentResponse } from '@/ai/text/utils/web-content-analyzer';
import { validateAnalyzeContentRequest } from '@/ai/text/utils/web-content-analyzer';
import { DomainError } from '@/lib/domain-errors';
import { ensureApiUser } from '@/lib/server/api-auth';
import { ErrorCodes } from '@/lib/server/error-codes';
import {
  createLoggerFromHeaders,
  resolveRequestId,
  withLogContext,
} from '@/lib/server/logger';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { analyzeWebContentWithCredits } from '@/lib/server/usecases/analyze-web-content-with-credits';

export async function POST(req: Request) {
  const requestId = resolveRequestId(req.headers);
  const logger = createLoggerFromHeaders(req.headers, {
    span: 'api.ai.text.analyze',
    route: '/api/analyze-content',
    requestId,
  });

  const authResult = await ensureApiUser(req);
  if (!authResult.ok) {
    logger.warn('Unauthorized analyze-content request');
    return authResult.response;
  }

  const rateLimitResult = await enforceRateLimit({
    request: req,
    scope: 'analyze-content',
    limit: 5,
    window: '5 m',
    userId: authResult.user.id,
  });

  if (!rateLimitResult.ok) {
    logger.warn(
      { userId: authResult.user.id },
      'Analyze-content rate limit exceeded'
    );
    return rateLimitResult.response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (error) {
    const validationError = new WebContentAnalyzerError(
      ErrorType.VALIDATION,
      'Invalid JSON body',
      'Request body must be valid JSON.',
      ErrorSeverity.MEDIUM,
      false,
      error instanceof Error ? error : undefined
    );

    logAnalyzerErrorServer(validationError, { requestId });

    logger.warn(
      { error, requestId },
      'Invalid JSON body for analyze-content request'
    );

    return NextResponse.json(
      {
        success: false,
        error: validationError.userMessage,
        code: validationError.code,
        retryable: validationError.retryable,
      } satisfies AnalyzeContentResponse,
      { status: 400 }
    );
  }

  const parsedBody = validateAnalyzeContentRequest(body);

  if (!parsedBody.success) {
    const firstIssueMessage = parsedBody.error.issues[0]?.message;
    const validationError = new WebContentAnalyzerError(
      ErrorType.VALIDATION,
      firstIssueMessage ?? 'Invalid analyze-content request parameters',
      'Invalid analyze-content request parameters.',
      ErrorSeverity.MEDIUM,
      false
    );

    logAnalyzerErrorServer(validationError, {
      requestId,
      issues: parsedBody.error.issues.map((issue) => ({
        path: issue.path,
        code: issue.code,
        message: issue.message,
      })),
    });

    logger.warn(
      {
        requestId,
        issues: parsedBody.error.issues.map((issue) => ({
          path: issue.path,
          code: issue.code,
          message: issue.message,
        })),
      },
      'Invalid analyze-content request parameters'
    );

    return NextResponse.json(
      {
        success: false,
        error: validationError.userMessage,
        code: validationError.code,
        retryable: validationError.retryable,
      } satisfies AnalyzeContentResponse,
      { status: 400 }
    );
  }

  try {
    const result = await withLogContext(
      { requestId, userId: authResult.user.id },
      () =>
        analyzeWebContentWithCredits({
          userId: authResult.user.id,
          body: parsedBody.data,
          requestId,
          requestUrl: req.url,
        })
    );

    return NextResponse.json(result.response, { status: result.status });
  } catch (error) {
    if (error instanceof DomainError) {
      logger.error(
        { error, code: error.code, retryable: error.retryable, requestId },
        'Domain error in analyze-content route'
      );

      const status = error.retryable ? 500 : 400;

      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          retryable: error.retryable,
        } satisfies AnalyzeContentResponse,
        { status }
      );
    }

    logger.error({ error, requestId }, 'Unexpected error in analyze-content');

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        code: ErrorCodes.UnexpectedError,
        retryable: true,
      } satisfies AnalyzeContentResponse,
      { status: 500 }
    );
  }
}
