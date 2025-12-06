import { describe, expect, it } from 'vitest';
import { verifyCreemWebhookSignature } from '@/payment/creem-signature';

describe('verifyCreemWebhookSignature', () => {
  it('returns true for valid signature', () => {
    const payload = '{"id":"evt_1"}';
    const secret = 'test_secret';

    // 计算期望签名
    const crypto = require('crypto') as typeof import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    const expectedSignature = hmac.update(payload).digest('hex');

    const result = verifyCreemWebhookSignature(
      payload,
      expectedSignature,
      secret
    );

    expect(result).toBe(true);
  });

  it('returns false for invalid signature', () => {
    const payload = '{"id":"evt_1"}';
    const secret = 'test_secret';

    const result = verifyCreemWebhookSignature(
      payload,
      'invalid-signature',
      secret
    );

    expect(result).toBe(false);
  });

  it('returns false when signature or secret is missing', () => {
    const payload = '{"id":"evt_1"}';

    expect(verifyCreemWebhookSignature(payload, null, 'secret')).toBe(false);
    expect(verifyCreemWebhookSignature(payload, 'sig', undefined)).toBe(false);
  });
});
