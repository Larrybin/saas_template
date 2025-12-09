import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as creemWebhookPost } from '@/app/api/webhooks/creem/route';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

const handleCreemWebhookMock = vi.fn();

vi.mock('@/lib/server/creem-webhook', () => ({
  handleCreemWebhook: (...args: unknown[]) => handleCreemWebhookMock(...args),
}));

describe('/api/webhooks/creem route', () => {
  beforeEach(() => {
    handleCreemWebhookMock.mockReset();
  });

  it('returns 400 and PAYMENT_SECURITY_VIOLATION when handler throws security error', async () => {
    handleCreemWebhookMock.mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.PaymentSecurityViolation,
        message: 'Security violation',
        retryable: false,
      })
    );

    const req = new Request('http://localhost/api/webhooks/creem', {
      method: 'POST',
      headers: {
        'creem-signature': 'sig_test',
      },
      body: '{}',
    });

    const res = await creemWebhookPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.PaymentSecurityViolation);
    expect(json.retryable).toBe(false);
    expect(handleCreemWebhookMock).toHaveBeenCalledTimes(1);
  });

  it('returns 400 and CREEM_WEBHOOK_MISCONFIGURED when handler throws non-retryable config error', async () => {
    handleCreemWebhookMock.mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.CreemWebhookMisconfigured,
        message: 'Misconfigured',
        retryable: false,
      })
    );

    const req = new Request('http://localhost/api/webhooks/creem', {
      method: 'POST',
      headers: {
        'creem-signature': 'sig_test',
      },
      body: '{}',
    });

    const res = await creemWebhookPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.CreemWebhookMisconfigured);
    expect(json.retryable).toBe(false);
    expect(handleCreemWebhookMock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when handler throws retryable DomainError', async () => {
    handleCreemWebhookMock.mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.CreemCheckoutNetworkError,
        message: 'Network error',
        retryable: true,
      })
    );

    const req = new Request('http://localhost/api/webhooks/creem', {
      method: 'POST',
      headers: {
        'creem-signature': 'sig_test',
      },
      body: '{}',
    });

    const res = await creemWebhookPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.CreemCheckoutNetworkError);
    expect(json.retryable).toBe(true);
    expect(handleCreemWebhookMock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 and UNEXPECTED_ERROR for unexpected errors', async () => {
    handleCreemWebhookMock.mockRejectedValueOnce(new Error('boom'));

    const req = new Request('http://localhost/api/webhooks/creem', {
      method: 'POST',
      headers: {
        'creem-signature': 'sig_test',
      },
      body: '{}',
    });

    const res = await creemWebhookPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.UnexpectedError);
    expect(json.retryable).toBe(true);
    expect(handleCreemWebhookMock).toHaveBeenCalledTimes(1);
  });
});
