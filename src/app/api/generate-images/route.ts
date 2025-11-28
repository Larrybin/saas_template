import { type NextRequest, NextResponse } from 'next/server';
import {
  type GenerateImageResponse,
  generateImageRequestSchema,
} from '@/ai/image/lib/api-types';
import { DomainError } from '@/lib/domain-errors';
import { ensureApiUser } from '@/lib/server/api-auth';
import { ErrorCodes } from '@/lib/server/error-codes';
import {
  createLoggerFromHeaders,
  resolveRequestId,
  withLogContext,
} from '@/lib/server/logger';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { generateImageWithCredits } from '@/lib/server/usecases/generate-image-with-credits';

export async function POST(req: NextRequest) {
  const requestId = resolveRequestId(req.headers);
  const logger = createLoggerFromHeaders(req.headers, {
    span: 'api.ai.image.generate',
    route: '/api/generate-images',
    requestId,
  });

  const authResult = await ensureApiUser(req);
  if (!authResult.ok) {
    logger.warn('Unauthorized image generation request');
    return authResult.response;
  }

  const rateLimitResult = await enforceRateLimit({
    request: req,
    scope: 'generate-images',
    limit: 10,
    window: '2 m',
    userId: authResult.user.id,
  });

  if (!rateLimitResult.ok) {
    logger.warn(
      { userId: authResult.user.id },
      'Image generation rate limit exceeded'
    );
    return rateLimitResult.response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (error) {
    logger.warn('Invalid JSON body for image generation request', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'Request body must be valid JSON.',
        code: ErrorCodes.ImageGenerateInvalidJson,
        retryable: false,
      } satisfies GenerateImageResponse,
      { status: 400 }
    );
  }

  const parseResult = generateImageRequestSchema.safeParse(body);

  if (!parseResult.success) {
    logger.warn(
      {
        issues: parseResult.error.issues.map((issue) => ({
          path: issue.path,
          code: issue.code,
          message: issue.message,
        })),
      },
      'Invalid image generation request parameters'
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid image generation parameters.',
        code: ErrorCodes.ImageGenerateInvalidParams,
        retryable: false,
      } satisfies GenerateImageResponse,
      { status: 400 }
    );
  }

  const { prompt, provider, modelId } = parseResult.data;

  try {
    const result = await withLogContext(
      { requestId, userId: authResult.user.id },
      () =>
        generateImageWithCredits({
          userId: authResult.user.id,
          request: { prompt, provider, modelId },
        })
    );

    if (!result.success) {
      return NextResponse.json(result satisfies GenerateImageResponse, {
        status:
          result.code === ErrorCodes.ImageGenerateInvalidJson ||
          result.code === ErrorCodes.ImageGenerateInvalidParams
            ? 400
            : result.code === ErrorCodes.ImageTimeout
              ? 504
              : result.code === ErrorCodes.ImageInvalidResponse
                ? 502
                : 500,
      });
    }

    return NextResponse.json(result satisfies GenerateImageResponse, {
      status: 200,
    });
  } catch (error) {
    if (error instanceof DomainError) {
      logger.error(
        { error, code: error.code, retryable: error.retryable },
        'Domain error in generate-images route'
      );

      const status = error.retryable ? 500 : 400;

      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          retryable: error.retryable,
        } satisfies GenerateImageResponse,
        { status }
      );
    }

    logger.error('Unexpected error in generate-images route', { error });

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate image. Please try again later.',
        code: ErrorCodes.ImageProviderError,
        retryable: true,
      } satisfies GenerateImageResponse,
      { status: 500 }
    );
  }
}
