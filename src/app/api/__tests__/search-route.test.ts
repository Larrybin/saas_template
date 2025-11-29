import { describe, expect, it, vi } from 'vitest';

const { searchGetMock } = vi.hoisted(() => ({
  searchGetMock: vi.fn(),
}));

vi.mock('fumadocs-core/search/server', () => ({
  createI18nSearchAPI: () => ({
    GET: (...args: unknown[]) => searchGetMock(...args),
  }),
}));

vi.mock('@/lib/source', () => ({
  source: {
    getLanguages: () => [],
  },
}));

// Import route handler after mocks are in place
import { GET as searchGet } from '@/app/api/search/route';

describe('/api/search route', () => {
  it('wraps successful search response in envelope', async () => {
    searchGetMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [{ id: '/docs/architecture-overview' }],
        }),
        { status: 200 }
      )
    );

    const req = new Request('http://localhost/api/search?q=test&locale=en', {
      method: 'GET',
    });

    const res = await searchGet(req);
    const json = (await res.json()) as {
      success: boolean;
      data?: unknown;
    };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      results: [{ id: '/docs/architecture-overview' }],
    });
  });

  it('returns error envelope when provider response is not ok', async () => {
    searchGetMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'upstream error' }), {
        status: 500,
      })
    );

    const req = new Request('http://localhost/api/search?q=test&locale=en', {
      method: 'GET',
    });

    const res = await searchGet(req);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe('DOCS_SEARCH_FAILED');
    expect(json.retryable).toBe(true);
  });
});
