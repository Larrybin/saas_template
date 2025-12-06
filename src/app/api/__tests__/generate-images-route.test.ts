import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsufficientCreditsError } from '@/credits/domain/errors';
import {
  enforceRateLimitMock,
  ensureApiUserMock,
  setupApiAuthAndRateLimit,
} from '../../../../tests/helpers/api';

vi.mock('@/lib/server/api-auth', () => ({
  ensureApiUser: (...args: unknown[]) => ensureApiUserMock(...args),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
}));

const generateImageWithCreditsMock = vi.fn();

vi.mock('@/lib/server/usecases/generate-image-with-credits', () => ({
  generateImageWithCredits: (...args: unknown[]) =>
    generateImageWithCreditsMock(...args),
}));

import type { GenerateImageResponse } from '@/ai/image/lib/api-types';
import { POST as generateImagesPost } from '@/app/api/generate-images/route';
import { createJsonPost } from '../../../../tests/utils/requests';

describe('/api/generate-images route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    setupApiAuthAndRateLimit('user_1');

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

    const res = await generateImagesPost(req);
    const json = (await res.json()) as GenerateImageResponse;

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('AI_IMAGE_INVALID_JSON');
    expect(generateImageWithCreditsMock).not.toHaveBeenCalled();
  });

  it('returns AI_IMAGE_INVALID_PARAMS when required fields are missing', async () => {
    const req = createJsonPost('http://localhost/api/generate-images', {
      // missing prompt/provider/modelId
    });

    const res = await generateImagesPost(req);
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

    const req = createJsonPost('http://localhost/api/generate-images', {
      prompt: 'test',
      provider: 'openai',
      modelId: 'dall-e-3',
    });

    const res = await generateImagesPost(req);
    const json = (await res.json()) as GenerateImageResponse;

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.code).toBe('AI_IMAGE_INVALID_RESPONSE');
  });

  it('returns 200 with successful image generation', async () => {
    const req = createJsonPost('http://localhost/api/generate-images', {
      prompt: 'test',
      provider: 'openai',
      modelId: 'dall-e-3',
    });

    const res = await generateImagesPost(req);
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

  it('maps InsufficientCreditsError from usecase to 400 with CREDITS_INSUFFICIENT_BALANCE', async () => {
    generateImageWithCreditsMock.mockRejectedValueOnce(
      new InsufficientCreditsError('Insufficient credits')
    );

    const req = createJsonPost('http://localhost/api/generate-images', {
      prompt: 'test',
      provider: 'openai',
      modelId: 'dall-e-3',
    });

    const res = await generateImagesPost(req);
    const json = (await res.json()) as GenerateImageResponse & {
      retryable?: boolean;
    };

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('CREDITS_INSUFFICIENT_BALANCE');
    expect(json.retryable).toBe(false);
  });
});
