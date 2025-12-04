import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InsufficientCreditsError } from '@/credits/domain/errors';
import { ErrorCodes } from '@/lib/server/error-codes';
import type { ExecuteAiChatWithBillingInput } from '@/lib/server/usecases/execute-ai-chat-with-billing';

const incrementAiUsageAndCheckWithinFreeQuotaMock = vi.fn();
const consumeCreditsMock = vi.fn();
const streamTextMock = vi.fn();

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

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
  convertToModelMessages: (messages: unknown) => messages,
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { executeAiChatWithBilling } from '@/lib/server/usecases/execute-ai-chat-with-billing';

describe('executeAiChatWithBilling - free quota and credits consumption', () => {
  const baseInput: ExecuteAiChatWithBillingInput = {
    userId: 'user-1',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'hello',
          },
        ],
      },
    ],
    model: 'openai/gpt-4o',
    webSearch: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockReset();
    consumeCreditsMock.mockReset();
    streamTextMock.mockReset();
  });

  it('skips credits consumption when usage is within free quota', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(true);
    const fakeResult = { stream: true };
    streamTextMock.mockReturnValue(fakeResult);

    const result = await executeAiChatWithBilling(baseInput);

    expect(result).toBe(fakeResult);
    expect(incrementAiUsageAndCheckWithinFreeQuotaMock).toHaveBeenCalledTimes(
      1
    );
    expect(incrementAiUsageAndCheckWithinFreeQuotaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        feature: 'chat',
        freeCallsPerPeriod: expect.any(Number),
      })
    );
    expect(consumeCreditsMock).not.toHaveBeenCalled();
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('consumes credits when free quota is exhausted', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(false);
    const fakeResult = { stream: true };
    streamTextMock.mockReturnValue(fakeResult);

    const result = await executeAiChatWithBilling(baseInput);

    expect(result).toBe(fakeResult);
    expect(consumeCreditsMock).toHaveBeenCalledTimes(1);
    expect(consumeCreditsMock).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 1,
      description: 'AI chat usage (1 credits)',
    });
  });

  it('propagates InsufficientCreditsError from consumeCredits', async () => {
    incrementAiUsageAndCheckWithinFreeQuotaMock.mockResolvedValueOnce(false);
    consumeCreditsMock.mockRejectedValueOnce(
      new InsufficientCreditsError('Insufficient credits')
    );

    await expect(executeAiChatWithBilling(baseInput)).rejects.toBeInstanceOf(
      InsufficientCreditsError
    );
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it('throws DomainError with AI_CHAT_INVALID_PARAMS when input is invalid', async () => {
    const invalidInput: ExecuteAiChatWithBillingInput = {
      ...baseInput,
      messages: [], // invalid: empty messages
    };

    await expect(executeAiChatWithBilling(invalidInput)).rejects.toMatchObject({
      code: ErrorCodes.AiChatInvalidParams,
      retryable: false,
    });
    expect(consumeCreditsMock).not.toHaveBeenCalled();
    expect(streamTextMock).not.toHaveBeenCalled();
  });
});
