import 'server-only';

import { createFal } from '@ai-sdk/fal';
import { fireworks } from '@ai-sdk/fireworks';
import { openai } from '@ai-sdk/openai';
import { replicate } from '@ai-sdk/replicate';
import {
  experimental_generateImage as generateImage,
  type ImageModel,
} from 'ai';
import { getImageGenerateBillingRule } from '@/ai/billing-config';
import type {
  GenerateImageRequest,
  GenerateImageResponse,
} from '@/ai/image/lib/api-types';
import type { ProviderKey } from '@/ai/image/lib/provider-config';
import {
  AI_USAGE_FEATURE,
  incrementAiUsageAndCheckWithinFreeQuota,
} from '@/ai/usage/ai-usage-service';
import { consumeCredits } from '@/credits/credits';
import { serverEnv } from '@/env/server';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';

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

const sanitizeImageResultForLog = (result: unknown) => {
  if (result == null) {
    return { type: typeof result };
  }

  if (Array.isArray(result)) {
    return { type: 'array', length: result.length };
  }

  if (typeof result === 'object') {
    const record = result as Record<string, unknown>;
    const image = record.image;
    return {
      type: 'object',
      keys: Object.keys(record),
      hasImage: Boolean(image),
      imageLength: typeof image === 'string' ? image.length : undefined,
      warningCount: Array.isArray(record.warnings)
        ? record.warnings.length
        : undefined,
    };
  }

  return { type: typeof result };
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

export type GenerateImageWithCreditsInput = {
  userId: string;
  request: GenerateImageRequest;
  requiredCredits?: number;
  planId?: string;
};

/**
 * Use Case: 生成图片并进行积分扣费。
 *
 * 责任：
 * - 在调用图片生成模型前先扣除指定积分（默认 1）。
 * - 根据 provider 配置调用对应模型，返回标准 `GenerateImageResponse`。
 *
 * 错误处理：
 * - 积分不足等 Credits 域错误通过 `consumeCredits` 抛出 DomainError，
 *   由调用方封装为 HTTP envelope。
 * - Provider 内部错误按现有逻辑映射为不同的 AI_IMAGE_* code。
 */
export async function generateImageWithCredits(
  input: GenerateImageWithCreditsInput
): Promise<GenerateImageResponse> {
  const { userId, request, requiredCredits, planId } = input;
  const { prompt, provider, modelId } = request;

  // Validate request parameters before touching free quota / credits
  if (!prompt || !provider || !modelId || !(provider in providerConfig)) {
    const logger = getLogger({
      span: 'usecase.ai.image.generate-with-credits',
      userId,
    });

    logger.warn('Invalid image generation request parameters', {
      provider,
      modelId,
      promptLength: typeof prompt === 'string' ? prompt.length : undefined,
    });

    return {
      success: false,
      error: 'Invalid request parameters',
      code: ErrorCodes.ImageGenerateInvalidParams,
      retryable: false,
    };
  }

  const billingRule = getImageGenerateBillingRule(
    planId ? { planId } : undefined
  );
  const creditsToConsume =
    typeof requiredCredits === 'number'
      ? requiredCredits
      : billingRule.creditsPerCall;

  const logger = getLogger({
    span: 'usecase.ai.image.generate-with-credits',
    userId,
  });

  logger.info(
    { userId, creditsPerCall: creditsToConsume },
    'Starting image generation with billing'
  );

  const freeCallsPerPeriod = billingRule.freeCallsPerPeriod ?? 0;
  const withinFreeQuota =
    freeCallsPerPeriod > 0
      ? await incrementAiUsageAndCheckWithinFreeQuota({
          userId,
          feature: AI_USAGE_FEATURE.generateImage,
          freeCallsPerPeriod,
        })
      : false;

  if (withinFreeQuota) {
    logger.info(
      { userId },
      'Image generation within free quota, skipping credits consumption'
    );
  } else {
    await consumeCredits({
      userId,
      amount: creditsToConsume,
      description: `AI image generation (${creditsToConsume} credits)`,
    });
  }

  logger.info(
    { userId, provider, modelId },
    'Credits check completed, invoking image generation provider'
  );

  try {
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
        resultSummary: sanitizeImageResultForLog(result),
      });
      return {
        success: false,
        error:
          'Image generation failed due to an unexpected provider response.',
        code: ErrorCodes.ImageInvalidResponse,
        retryable: true,
      };
    }

    return {
      success: true,
      data: {
        provider,
        image: result.image,
      },
    };
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
      return {
        success: false,
        error: 'Image generation timed out. Please try again.',
        code: ErrorCodes.ImageTimeout,
        retryable: true,
      };
    }

    logger.error('Error generating image', baseLog);

    return {
      success: false,
      error: 'Failed to generate image. Please try again later.',
      code: ErrorCodes.ImageProviderError,
      retryable: true,
    };
  }
}
