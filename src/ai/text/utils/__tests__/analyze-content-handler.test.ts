import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AnalyzeContentHandlerDeps,
  AnalyzeContentHandlerInput,
} from '../analyze-content-handler';
import { handleAnalyzeContentRequest } from '../analyze-content-handler';
import {
  ErrorSeverity,
  ErrorType,
  WebContentAnalyzerError,
} from '../error-handling';

vi.mock('server-only', () => ({}));

vi.mock('@/ai/text/utils/web-content-config.server', () => ({
  webContentAnalyzerServerConfig: {
    firecrawl: {
      baseUrl: 'https://api.firecrawl.dev',
      formats: ['markdown', 'screenshot'] as const,
      includeTags: [] as const,
      excludeTags: [] as const,
      onlyMainContent: true,
      waitFor: 0,
      screenshot: {
        quality: 80,
        fullPage: false,
      },
      rateLimit: {
        maxConcurrentRequests: 1,
        requestDelay: 0,
      },
      maxContentSize: 100000,
    },
  },
  getFirecrawlApiKey: () => 'test-key',
  validateFirecrawlConfig: vi.fn(() => true),
}));

import { validateFirecrawlConfig } from '@/ai/text/utils/web-content-config.server';

describe('handleAnalyzeContentRequest', () => {
  const baseInput: Omit<AnalyzeContentHandlerInput, 'body'> = {
    requestId: 'req-1',
    requestUrl: 'http://localhost/api/analyze-content',
    startTime: 0,
  };

  let deps: AnalyzeContentHandlerDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      scrapeWebpage: vi.fn(async () => ({
        content: 'hello world',
        screenshot: 'screenshot-url',
      })),
      analyzeContent: vi.fn(async (content, url, provider) => ({
        title: 'Test Title',
        description: 'Test Description',
        introduction: 'Intro',
        features: ['f1'],
        pricing: 'Not specified',
        useCases: ['u1'],
        url,
        analyzedAt: '2024-01-01T00:00:00.000Z',
      })),
    };
  });

  it('returns 200 and analysis data for a valid request', async () => {
    const result = await handleAnalyzeContentRequest(
      {
        ...baseInput,
        body: {
          url: 'https://example.com',
          modelProvider: 'openrouter',
        },
      },
      deps,
    );

    expect(result.status).toBe(200);
    expect(result.response.success).toBe(true);
    expect(result.response.data?.analysis.title).toBe('Test Title');
    expect(deps.scrapeWebpage).toHaveBeenCalledWith('https://example.com');
    expect(deps.analyzeContent).toHaveBeenCalledWith(
      expect.any(String),
      'https://example.com',
      'openrouter',
    );
  });

  it('returns 400 when request body fails schema validation', async () => {
    const result = await handleAnalyzeContentRequest(
      {
        ...baseInput,
        body: {
          url: 'not-a-url',
          modelProvider: 'openrouter',
        },
      },
      deps,
    );

    expect(result.status).toBe(400);
    expect(result.response.success).toBe(false);
    expect(result.response.error).toBe('Please provide a valid URL.');
    expect(deps.scrapeWebpage).not.toHaveBeenCalled();
  });

  it('returns 503 when Firecrawl config is invalid', async () => {
    const validateFirecrawlConfigMock = validateFirecrawlConfig as unknown as vi.Mock;
    validateFirecrawlConfigMock.mockReturnValueOnce(false);

    const result = await handleAnalyzeContentRequest(
      {
        ...baseInput,
        body: {
          url: 'https://example.com',
          modelProvider: 'openrouter',
        },
      },
      deps,
    );

    expect(result.status).toBe(503);
    expect(result.response.success).toBe(false);
    expect(result.response.error).toContain('Web content analysis service');
    expect(deps.scrapeWebpage).not.toHaveBeenCalled();
  });

  it('maps WebContentAnalyzerError type to HTTP status', async () => {
    deps.scrapeWebpage = vi.fn(async () => {
      throw new WebContentAnalyzerError(
        ErrorType.TIMEOUT,
        'timeout',
        'Timed out',
        ErrorSeverity.MEDIUM,
        true,
      );
    });

    const result = await handleAnalyzeContentRequest(
      {
        ...baseInput,
        body: {
          url: 'https://example.com',
          modelProvider: 'openrouter',
        },
      },
      deps,
    );

    expect(result.status).toBe(408);
    expect(result.response.success).toBe(false);
    expect(result.response.error).toBe('Timed out');
  });
});
