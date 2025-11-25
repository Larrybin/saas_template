import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureApiUserMock = vi.fn();
const enforceRateLimitMock = vi.fn();
const generateImageWithCreditsMock = vi.fn();

vi.mock('@/lib/server/api-auth', () => ({
  ensureApiUser: (...args: unknown[]) => ensureApiUserMock(...args),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
}));

vi.mock('@/lib/server/usecases/generate-image-with-credits', () => ({
  generateImageWithCredits: (...args: unknown[]) =>
    generateImageWithCreditsMock(...args),
}));

import type { GenerateImageResponse } from '@/ai/image/lib/api-types';
import { POST as generateImagesPost } from '@/app/api/generate-images/route';

describe('/api/generate-images route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    ensureApiUserMock.mockResolvedValue({
      ok: true,
      user: { id: 'user_1' },
      response: null,
    });

    enforceRateLimitMock.mockResolvedValue({ ok: true });

    generateImageWithCreditsMock.mockResolvedValue({
      success: true,
      data: {
        provider: 'openai',
        image: 'base64-image',
      },
    } satisfies GenerateImageResponse);
  });

  it('returns AI_IMAGE_INVALID_JSON when body is not valid JSON', async () => {
    const req = new Request('http://localhost/api/generate-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const res = await generateImagesPost(req as any);
    const json = (await res.json()) as GenerateImageResponse;

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('AI_IMAGE_INVALID_JSON');
    expect(generateImageWithCreditsMock).not.toHaveBeenCalled();
  });

  it('returns AI_IMAGE_INVALID_PARAMS when required fields are missing', async () => {
    const req = new Request('http://localhost/api/generate-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // missing prompt/provider/modelId
      }),
    });

    const res = await generateImagesPost(req as any);
    const json = (await res.json()) as GenerateImageResponse;

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('AI_IMAGE_INVALID_PARAMS');
    expect(generateImageWithCreditsMock).not.toHaveBeenCalled();
  });

  it('maps use case error codes to HTTP status', async () => {
    generateImageWithCreditsMock.mockResolvedValueOnce({
      success: false,
      error: 'Invalid provider response',
      code: 'AI_IMAGE_INVALID_RESPONSE',
      retryable: true,
    } satisfies GenerateImageResponse);

    const req = new Request('http://localhost/api/generate-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'test',
        provider: 'openai',
        modelId: 'dall-e-3',
      }),
    });

    const res = await generateImagesPost(req as any);
    const json = (await res.json()) as GenerateImageResponse;

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.code).toBe('AI_IMAGE_INVALID_RESPONSE');
  });

  it('returns 200 with successful image generation', async () => {
    const req = new Request('http://localhost/api/generate-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'test',
        provider: 'openai',
        modelId: 'dall-e-3',
      }),
    });

    const res = await generateImagesPost(req as any);
    const json = (await res.json()) as GenerateImageResponse;

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(generateImageWithCreditsMock).toHaveBeenCalledTimes(1);
    expect(generateImageWithCreditsMock).toHaveBeenCalledWith({
      userId: 'user_1',
      request: {
        prompt: 'test',
        provider: 'openai',
        modelId: 'dall-e-3',
      },
    });
  });
});
