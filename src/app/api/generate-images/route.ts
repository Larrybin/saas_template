import { createFal } from '@ai-sdk/fal';
import { fireworks } from '@ai-sdk/fireworks';
import { openai } from '@ai-sdk/openai';
import { replicate } from '@ai-sdk/replicate';
import {
  experimental_generateImage as generateImage,
  type ImageModel,
} from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import type {
  GenerateImageRequest,
  GenerateImageResponse,
} from '@/ai/image/lib/api-types';
import type { ProviderKey } from '@/ai/image/lib/provider-config';
import { serverEnv } from '@/env/server';
import { ensureApiUser } from '@/lib/server/api-auth';
import { createLoggerFromHeaders } from '@/lib/server/logger';
import { enforceRateLimit } from '@/lib/server/rate-limit';

/**
 * Intended to be slightly less than the maximum execution time allowed by the
 * runtime so that we can gracefully terminate our request.
 */
const TIMEOUT_MILLIS = 55 * 1000;

const DEFAULT_IMAGE_SIZE = '1024x1024';
const DEFAULT_ASPECT_RATIO = '1:1';

const fal = serverEnv.ai.falApiKey
  ? createFal({
      apiKey: serverEnv.ai.falApiKey,
    })
  : null;

interface ProviderConfig {
  createImageModel: (modelId: string) => ImageModel;
  dimensionFormat: 'size' | 'aspectRatio';
}

const providerConfig: Record<ProviderKey, ProviderConfig> = {
  openai: {
    createImageModel: openai.image,
    dimensionFormat: 'size',
  },
  fireworks: {
    createImageModel: fireworks.image,
    dimensionFormat: 'aspectRatio',
  },
  replicate: {
    createImageModel: replicate.image,
    dimensionFormat: 'size',
  },
  fal: {
    createImageModel: (modelId: string) => {
      if (!fal) {
        throw new Error('FAL_API_KEY is not configured');
      }
      return fal.image(modelId);
    },
    dimensionFormat: 'size',
  },
};

const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMillis: number
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeoutMillis)
    ),
  ]);
};

export async function POST(req: NextRequest) {
  const logger = createLoggerFromHeaders(req.headers, {
    span: 'ai-generate-images',
    route: '/api/generate-images',
  });

  const authResult = await ensureApiUser(req);
  if (!authResult.ok) {
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
        code: 'AI_IMAGE_INVALID_JSON',
        retryable: false,
      } satisfies GenerateImageResponse,
      { status: 400 }
    );
  }

  const { prompt, provider, modelId } = body as GenerateImageRequest;

  try {
    if (!prompt || !provider || !modelId || !(provider in providerConfig)) {
      logger.warn('Invalid image generation request parameters', {
        provider,
        modelId,
        promptLength: typeof prompt === 'string' ? prompt.length : undefined,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request parameters',
          code: 'AI_IMAGE_INVALID_PARAMS',
          retryable: false,
        } satisfies GenerateImageResponse,
        { status: 400 }
      );
    }

    const config = providerConfig[provider as ProviderKey];
    const startstamp = performance.now();
    const generatePromise = generateImage({
      model: config.createImageModel(modelId),
      prompt,
      ...(config.dimensionFormat === 'size'
        ? { size: DEFAULT_IMAGE_SIZE }
        : { aspectRatio: DEFAULT_ASPECT_RATIO }),
      ...(provider !== 'openai' && {
        seed: Math.floor(Math.random() * 1000000),
      }),
      // Vertex AI only accepts a specified seed if watermark is disabled.
      providerOptions: { vertex: { addWatermark: false } },
    }).then(({ image, warnings }) => {
      if (warnings?.length > 0) {
        logger.warn('Image generation completed with warnings', {
          provider,
          modelId,
          warnings,
        });
      }
      const elapsedSeconds = ((performance.now() - startstamp) / 1000).toFixed(
        1
      );
      logger.info('Completed image generation request', {
        provider,
        modelId,
        elapsedSeconds,
      });

      return {
        provider,
        image: image.base64,
      };
    });

    const result = await withTimeout(generatePromise, TIMEOUT_MILLIS);

    if (!('image' in result) || !result.image) {
      logger.error('Image generation returned invalid result shape', {
        provider,
        modelId,
        result,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            'Image generation failed due to an unexpected provider response.',
          code: 'AI_IMAGE_INVALID_RESPONSE',
          retryable: true,
        } satisfies GenerateImageResponse,
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          provider,
          image: result.image,
        },
      } satisfies GenerateImageResponse,
      { status: 200 }
    );
  } catch (error) {
    const baseLog = {
      provider,
      modelId,
      error,
    };

    if (
      error instanceof Error &&
      (error.message.toLowerCase().includes('timed out') ||
        error.message.toLowerCase().includes('timeout'))
    ) {
      logger.error('Image generation timed out', baseLog);
      return NextResponse.json(
        {
          success: false,
          error: 'Image generation timed out. Please try again.',
          code: 'AI_IMAGE_TIMEOUT',
          retryable: true,
        } satisfies GenerateImageResponse,
        { status: 504 }
      );
    }

    logger.error('Error generating image', baseLog);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate image. Please try again later.',
        code: 'AI_IMAGE_PROVIDER_ERROR',
        retryable: true,
      } satisfies GenerateImageResponse,
      { status: 500 }
    );
  }
}
