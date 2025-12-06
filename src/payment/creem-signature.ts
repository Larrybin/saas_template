import { createHmac, timingSafeEqual } from 'crypto';

export function verifyCreemWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  } catch {
    return false;
  }
}
