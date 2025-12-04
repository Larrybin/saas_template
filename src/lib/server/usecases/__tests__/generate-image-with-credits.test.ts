import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InsufficientCreditsError } from '@/credits/domain/errors';
import { ErrorCodes } from '@/lib/server/error-codes';

const getImageGenerateBillingRuleMock = vi.fn();

const incrementAiUsageAndCheckWithinFreeQuotaMock = vi.fn();
const consumeCreditsMock = vi.fn();
const generateImageMock = vi.fn();

vi.mock('server-only', () => ({}));

vi.mock('@/ai/usage/ai-usage-service', () => ({
  AI_USAGE_FEATURE: {
    chat: 'chat',
    analyzeContent: 'analyze-content',
    generateImage: 'generate-image',
  },
  incrementAiUsageAndCheckWithinFreeQuota: (...args: unknown[]) =>
    incrementAiUsageAndCheckWithinFreeQuotaMock(...args),
}));

vi.mock('@/ai/billing-config', () => ({
  getImageGenerateBillingRule: (...args: unknown[]) =>
    getImageGenerateBillingRuleMock(...args),
}));

vi.mock('@/credits/credits', () => ({
  consumeCredits: (...args: unknown[]) => consumeCreditsMock(...args),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: {
    image: (modelId: string) => ({ provider: 'openai', modelId }),
  },
}));

vi.mock('@ai-sdk/fireworks', () => ({
  fireworks: {
    image: (modelId: string) => ({ provider: 'fireworks', modelId }),
  },
}));

vi.mock('@ai-sdk/replicate', () => ({
  replicate: {
    image: (modelId: string) => ({ provider: 'replicate', modelId }),
  },
}));

vi.mock('@ai-sdk/fal', () => ({
  createFal: () => ({
    image: (modelId: string) => ({ provider: 'fal', modelId }),
  }),
}));

vi.mock('@/env/server', () => ({
  serverEnv: {
    ai: {
      falApiKey: null,
    },
  },
}));

vi.mock('ai', () => ({
  experimental_generateImage: (...args: unknown[]) =>
    generateImageMock(...args),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { generateImageWithCredits } from '@/lib/server/usecases/generate-image-with-credits';

describe('generateImageWithCredits - free quota and credits consumption', () => {
  const baseInput = {
    userId: 'user-1',
    request: {
      prompt: 'a cat',
      provider: 'openai',
      modelId: 'dall-e',
    },
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockReset();
    consumeCreditsMock.mockReset();
    generateImageMock.mockReset();
    getImageGenerateBillingRuleMock.mockReset();
    getImageGenerateBillingRuleMock.mockReturnValue({
      enabled: true,
      creditsPerCall: 1,
      freeCallsPerPeriod: 8,
    });
  });

  it('skips credits consumption when usage is within free quota', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(true);
    generateImageMock.mockResolvedValueOnce({
      image: { base64: 'IMAGE_DATA' },
      warnings: [],
    });

    const result = await generateImageWithCredits(baseInput);

    expect(result.success).toBe(true);
    expect(result.data?.provider).toBe('openai');
    expect(result.data?.image).toBe('IMAGE_DATA');
    expect(incrementAiUsageAndCheckWithinFreeQuotaMock).toHaveBeenCalledTimes(
      1
    );
    expect(incrementAiUsageAndCheckWithinFreeQuotaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        feature: 'generate-image',
        freeCallsPerPeriod: expect.any(Number),
      })
    );
    expect(consumeCreditsMock).not.toHaveBeenCalled();
    expect(generateImageMock).toHaveBeenCalledTimes(1);
  });

  it('passes planId via AiBillingContext into billing rule', async () => {
    // Arrange a billing rule with specific freeCallsPerPeriod
    getImageGenerateBillingRuleMock.mockReturnValueOnce({
      enabled: true,
      creditsPerCall: 2,
      freeCallsPerPeriod: 5,
    });
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(true);
    generateImageMock.mockResolvedValueOnce({
      image: { base64: 'IMAGE_DATA' },
      warnings: [],
    });

    const result = await generateImageWithCredits({
      ...baseInput,
      // planId 来自上层 Billing/订阅上下文，这里只关心它被透传到计费规则
      planId: 'pro',
    } as never);

    expect(result.success).toBe(true);
    expect(getImageGenerateBillingRuleMock).toHaveBeenCalledTimes(1);
    expect(getImageGenerateBillingRuleMock).toHaveBeenCalledWith({
      planId: 'pro',
    });
    expect(incrementAiUsageAndCheckWithinFreeQuotaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        freeCallsPerPeriod: 5,
      })
    );
  });

  it('consumes credits when free quota is exhausted', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(false);
    generateImageMock.mockResolvedValueOnce({
      image: { base64: 'IMAGE_DATA' },
      warnings: [],
    });

    const result = await generateImageWithCredits(baseInput);

    expect(result.success).toBe(true);
    expect(consumeCreditsMock).toHaveBeenCalledTimes(1);
    expect(consumeCreditsMock).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 1,
      description: 'AI image generation (1 credits)',
    });
  });

  it('propagates InsufficientCreditsError from consumeCredits', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(false);
    consumeCreditsMock.mockRejectedValueOnce(
      new InsufficientCreditsError('Insufficient credits')
    );

    await expect(generateImageWithCredits(baseInput)).rejects.toBeInstanceOf(
      InsufficientCreditsError
    );
    expect(generateImageMock).not.toHaveBeenCalled();
  });

  it('returns AI_IMAGE_INVALID_PARAMS when request is invalid', async () => {
    const result = await generateImageWithCredits({
      userId: 'user-1',
      request: {
        // invalid: empty prompt
        prompt: '',
        provider: 'openai',
        modelId: 'dall-e',
      },
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe(ErrorCodes.ImageGenerateInvalidParams);
    expect(result.retryable).toBe(false);
    expect(incrementAiUsageAndCheckWithinFreeQuotaMock).not.toHaveBeenCalled();
    expect(consumeCreditsMock).not.toHaveBeenCalled();
    expect(generateImageMock).not.toHaveBeenCalled();
  });

  it('maps timeout-like provider errors to AI_IMAGE_TIMEOUT', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(false);
    generateImageMock.mockRejectedValueOnce(
      new Error('Image request timed out')
    );

    const result = await generateImageWithCredits(baseInput);

    expect(result.success).toBe(false);
    expect(result.code).toBe(ErrorCodes.ImageTimeout);
    expect(result.retryable).toBe(true);
  });

  it('maps generic provider errors to AI_IMAGE_PROVIDER_ERROR', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(false);
    generateImageMock.mockRejectedValueOnce(new Error('provider failed'));

    const result = await generateImageWithCredits(baseInput);

    expect(result.success).toBe(false);
    expect(result.code).toBe(ErrorCodes.ImageProviderError);
    expect(result.retryable).toBe(true);
  });

  it('returns AI_IMAGE_INVALID_RESPONSE when provider returns empty image', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(true);
    generateImageMock.mockResolvedValueOnce({
      image: { base64: '' },
      warnings: [],
    });

    const result = await generateImageWithCredits(baseInput);

    expect(result.success).toBe(false);
    expect(result.code).toBe(ErrorCodes.ImageInvalidResponse);
    expect(result.retryable).toBe(true);
  });
});
