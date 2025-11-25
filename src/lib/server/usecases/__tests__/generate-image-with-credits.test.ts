import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InsufficientCreditsError } from '@/credits/domain/errors';

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
});
