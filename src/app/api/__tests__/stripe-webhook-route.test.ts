import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '@/lib/server/error-codes';

const handleStripeWebhookMock = vi.fn();

vi.mock('@/lib/server/stripe-webhook', () => ({
  handleStripeWebhook: (...args: unknown[]) => handleStripeWebhookMock(...args),
}));

import { POST as stripeWebhookPost } from '@/app/api/webhooks/stripe/route';

describe('/api/webhooks/stripe route', () => {
  beforeEach(() => {
    handleStripeWebhookMock.mockReset();
  });

  it('returns 400 and PAYMENT_SECURITY_VIOLATION when payload is missing', async () => {
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test',
      },
    });

    const res = await stripeWebhookPost(req as never);
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
    expect(handleStripeWebhookMock).not.toHaveBeenCalled();
  });

  it('returns 400 and PAYMENT_SECURITY_VIOLATION when signature is missing', async () => {
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    });

    const res = await stripeWebhookPost(req as never);
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
    expect(handleStripeWebhookMock).not.toHaveBeenCalled();
  });

  it('returns 500 and UNEXPECTED_ERROR for unexpected errors', async () => {
    handleStripeWebhookMock.mockRejectedValueOnce(new Error('boom'));

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test',
      },
      body: '{}',
    });

    const res = await stripeWebhookPost(req as never);
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
    expect(handleStripeWebhookMock).toHaveBeenCalledTimes(1);
  });
});
