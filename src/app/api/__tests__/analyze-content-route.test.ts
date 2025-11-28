import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureApiUserMock = vi.fn();
const enforceRateLimitMock = vi.fn();
const analyzeWebContentWithCreditsMock = vi.fn();

vi.mock('@/lib/server/api-auth', () => ({
  ensureApiUser: (...args: unknown[]) => ensureApiUserMock(...args),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
}));

vi.mock('@/lib/server/usecases/analyze-web-content-with-credits', () => ({
  analyzeWebContentWithCredits: (...args: unknown[]) =>
    analyzeWebContentWithCreditsMock(...args),
}));

import type { AnalyzeContentResponse } from '@/ai/text/utils/web-content-analyzer';
import { POST as analyzeContentPost } from '@/app/api/analyze-content/route';

describe('/api/analyze-content route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    ensureApiUserMock.mockResolvedValue({
      ok: true,
      user: { id: 'user_1' },
      response: null,
    });

    enforceRateLimitMock.mockResolvedValue({ ok: true });

    analyzeWebContentWithCreditsMock.mockResolvedValue({
      status: 200,
      response: {
        success: true,
        data: {
          analysis: {
            title: 'Test',
            description: 'Desc',
            introduction: 'Intro',
            features: [],
            pricing: 'Not specified',
            useCases: [],
            url: 'https://example.com',
            analyzedAt: new Date().toISOString(),
          },
        },
      } satisfies AnalyzeContentResponse,
    });
  });

  it('returns validation error when body is not valid JSON', async () => {
    const req = new Request('http://localhost/api/analyze-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const res = await analyzeContentPost(req as any);
    const json = (await res.json()) as AnalyzeContentResponse;

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('ANALYZE_CONTENT_INVALID_JSON');
    expect(analyzeWebContentWithCreditsMock).not.toHaveBeenCalled();
  });

  it('returns validation error when request body fails schema validation', async () => {
    const req = new Request('http://localhost/api/analyze-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'not-a-url',
        modelProvider: 'openrouter',
      }),
    });

    const res = await analyzeContentPost(req as any);
    const json = (await res.json()) as AnalyzeContentResponse;

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('ANALYZE_CONTENT_INVALID_PARAMS');
    expect(analyzeWebContentWithCreditsMock).not.toHaveBeenCalled();
  });

  it('delegates to use case on valid request', async () => {
    const req = new Request('http://localhost/api/analyze-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com',
        modelProvider: 'openrouter',
      }),
    });

    const res = await analyzeContentPost(req as any);
    const json = (await res.json()) as AnalyzeContentResponse;

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(analyzeWebContentWithCreditsMock).toHaveBeenCalledTimes(1);
    expect(analyzeWebContentWithCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        requestId: expect.any(String),
        body: {
          url: 'https://example.com',
          modelProvider: 'openrouter',
        },
      })
    );
  });
});
