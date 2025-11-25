import { NextResponse } from 'next/server';
import { chatRequestSchema } from '@/ai/chat/lib/api-schema';
import { DomainError } from '@/lib/domain-errors';
import { ensureApiUser } from '@/lib/server/api-auth';
import {
  createLoggerFromHeaders,
  resolveRequestId,
  withLogContext,
} from '@/lib/server/logger';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { executeAiChatWithBilling } from '@/lib/server/usecases/execute-ai-chat-with-billing';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const requestId = resolveRequestId(req.headers);
  const logger = createLoggerFromHeaders(req.headers, {
    span: 'api.ai.chat',
    route: '/api/chat',
    requestId,
  });

  const authResult = await ensureApiUser(req);
  if (!authResult.ok) {
    logger.warn('Unauthorized chat request');
    return authResult.response;
  }

  const rateLimitResult = await enforceRateLimit({
    request: req,
    scope: 'chat',
    limit: 30,
    window: '1 m',
    userId: authResult.user.id,
  });

  if (!rateLimitResult.ok) {
    logger.warn({ userId: authResult.user.id }, 'Chat rate limit exceeded');
    return rateLimitResult.response;
  }

  const body = await req.json();
  const parseResult = chatRequestSchema.safeParse(body);

  if (!parseResult.success) {
    logger.warn(
      {
        issues: parseResult.error.issues.map((issue) => ({
          path: issue.path,
          code: issue.code,
          message: issue.message,
        })),
      },
      'Invalid chat request parameters'
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid chat request parameters',
        code: 'AI_CHAT_INVALID_PARAMS',
        retryable: false,
      },
      { status: 400 }
    );
  }

  const { messages, model, webSearch } = parseResult.data;

  logger.info(
    { userId: authResult.user.id, model, webSearch },
    'Chat request accepted'
  );

  try {
    const result = await withLogContext(
      { requestId, userId: authResult.user.id },
      () =>
        executeAiChatWithBilling({
          userId: authResult.user.id,
          messages,
          model,
          webSearch,
        })
    );

    // send sources and reasoning back to the client
    return result.toUIMessageStreamResponse({
      sendSources: true,
      sendReasoning: true,
    });
  } catch (error) {
    if (error instanceof DomainError) {
      logger.error(
        { error, code: error.code, retryable: error.retryable, requestId },
        'Domain error in chat route'
      );

      const status = error.retryable ? 500 : 400;

      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          retryable: error.retryable,
        },
        { status }
      );
    }

    logger.error({ error, requestId }, 'Unexpected error in chat route');

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        code: 'UNEXPECTED_ERROR',
        retryable: true,
      },
      { status: 500 }
    );
  }
}
