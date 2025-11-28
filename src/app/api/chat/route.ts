import { NextResponse } from 'next/server';
import { chatRequestSchema } from '@/ai/chat/lib/api-schema';
import {
  createErrorEnvelope,
  createErrorEnvelopeFromDomainError,
} from '@/lib/domain-error-utils';
import { DomainError } from '@/lib/domain-errors';
import { ensureApiUser } from '@/lib/server/api-auth';
import { ErrorCodes } from '@/lib/server/error-codes';
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

  let body: unknown;
  try {
    body = await req.json();
  } catch (error) {
    logger.warn({ error, requestId }, 'Invalid JSON body for chat request');

    return NextResponse.json(
      createErrorEnvelope(
        ErrorCodes.AiChatInvalidJson,
        'Request body must be valid JSON.',
        false
      ),
      { status: 400 }
    );
  }

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
      createErrorEnvelope(
        ErrorCodes.AiChatInvalidParams,
        'Invalid chat request parameters',
        false
      ),
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

      return NextResponse.json(createErrorEnvelopeFromDomainError(error), {
        status,
      });
    }

    logger.error({ error, requestId }, 'Unexpected error in chat route');

    return NextResponse.json(
      createErrorEnvelope(
        ErrorCodes.UnexpectedError,
        'Internal server error',
        true
      ),
      { status: 500 }
    );
  }
}
