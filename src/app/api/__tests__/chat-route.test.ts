import { describe, expect, it, vi } from 'vitest';

const ensureApiUserMock = vi.fn();
const enforceRateLimitMock = vi.fn();
const executeAiChatWithBillingMock = vi.fn();

vi.mock('@/lib/server/api-auth', () => ({
  ensureApiUser: (...args: unknown[]) => ensureApiUserMock(...args),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
}));

vi.mock('@/lib/server/usecases/execute-ai-chat-with-billing', () => ({
  executeAiChatWithBilling: (...args: unknown[]) =>
    executeAiChatWithBillingMock(...args),
}));

// Import route handler after mocks are in place
import { POST as chatPost } from '@/app/api/chat/route';

describe('/api/chat route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    ensureApiUserMock.mockResolvedValue({
      ok: true,
      user: { id: 'user_1' },
      response: null,
    });

    enforceRateLimitMock.mockResolvedValue({ ok: true });

    executeAiChatWithBillingMock.mockResolvedValue({
      toUIMessageStreamResponse: () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });
  });

  it('returns 400 and AI_CHAT_INVALID_PARAMS when body fails schema validation', async () => {
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // missing messages field
        model: 'openai/gpt-4o',
        webSearch: true,
      }),
    });

    const res = await chatPost(req);
    const json = (await res.json()) as {
      success: boolean;
      code?: string;
      error?: string;
    };

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('AI_CHAT_INVALID_PARAMS');
    expect(executeAiChatWithBillingMock).not.toHaveBeenCalled();
  });

  it('invokes use case and returns streaming response for valid body', async () => {
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        model: 'openai/gpt-4o',
        webSearch: false,
      }),
    });

    const res = await chatPost(req);

    expect(res.status).toBe(200);
    expect(executeAiChatWithBillingMock).toHaveBeenCalledTimes(1);
    expect(executeAiChatWithBillingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        model: 'openai/gpt-4o',
        webSearch: false,
      })
    );
  });
});

