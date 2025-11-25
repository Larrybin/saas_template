import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InsufficientCreditsError } from '@/credits/domain/errors';

const incrementAiUsageAndCheckWithinFreeQuotaMock = vi.fn();
const consumeCreditsMock = vi.fn();
const preflightAnalyzeContentRequestMock = vi.fn();
const handleAnalyzeContentRequestMock = vi.fn();

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

vi.mock('@/ai/text/utils/analyze-content-handler', () => ({
  preflightAnalyzeContentRequest: (...args: unknown[]) =>
    preflightAnalyzeContentRequestMock(...args),
  handleAnalyzeContentRequest: (...args: unknown[]) =>
    handleAnalyzeContentRequestMock(...args),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { analyzeWebContentWithCredits } from '@/lib/server/usecases/analyze-web-content-with-credits';

describe('analyzeWebContentWithCredits - free quota and credits consumption', () => {
  const baseInput = {
    userId: 'user-1',
    body: {
      url: 'https://example.com',
      modelProvider: 'openrouter',
    },
    requestId: 'req-1',
    requestUrl: 'http://localhost/api/analyze-content',
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockReset();
    consumeCreditsMock.mockReset();
    preflightAnalyzeContentRequestMock.mockReset();
    handleAnalyzeContentRequestMock.mockReset();

    preflightAnalyzeContentRequestMock.mockReturnValue({
      ok: true,
      data: {
        url: 'https://example.com',
        modelProvider: 'openrouter',
      },
    });

    handleAnalyzeContentRequestMock.mockResolvedValue({
      status: 200,
      response: {
        success: true,
        data: {
          analysis: { title: 'ok' },
        },
      },
    });
  });

  it('skips credits consumption when usage is within free quota', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(true);

    const result = await analyzeWebContentWithCredits(baseInput);

    expect(result.status).toBe(200);
    expect(result.response.success).toBe(true);
    expect(incrementAiUsageAndCheckWithinFreeQuotaMock).toHaveBeenCalledTimes(
      1
    );
    expect(incrementAiUsageAndCheckWithinFreeQuotaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        feature: 'analyze-content',
        freeCallsPerPeriod: expect.any(Number),
      })
    );
    expect(consumeCreditsMock).not.toHaveBeenCalled();
    expect(handleAnalyzeContentRequestMock).toHaveBeenCalledTimes(1);
  });

  it('consumes credits when free quota is exhausted', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(false);

    await analyzeWebContentWithCredits(baseInput);

    expect(consumeCreditsMock).toHaveBeenCalledTimes(1);
    expect(consumeCreditsMock).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 1,
      description: 'AI web content analysis (1 credits)',
    });
  });

  it('propagates InsufficientCreditsError when credits are insufficient', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(false);
    consumeCreditsMock.mockRejectedValueOnce(
      new InsufficientCreditsError('Insufficient credits')
    );

    await expect(
      analyzeWebContentWithCredits(baseInput)
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(handleAnalyzeContentRequestMock).not.toHaveBeenCalled();
  });
});
