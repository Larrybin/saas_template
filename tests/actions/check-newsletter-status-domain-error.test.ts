import { describe, expect, it, vi } from 'vitest';
import '../helpers/actions';

import { checkNewsletterStatusAction } from '@/actions/check-newsletter-status';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/newsletter', () => ({
  isSubscribed: vi.fn(),
}));

describe('checkNewsletterStatusAction DomainError behavior', () => {
  const email = 'user@example.com';

  it('returns success with subscribed flag when provider succeeds', async () => {
    const { isSubscribed } = await import('@/newsletter');

    (isSubscribed as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      true
    );

    const result = await checkNewsletterStatusAction({
      parsedInput: { email },
      ctx: { user: { id: 'user_1', email } },
    } as never);

    expect(result).toEqual({ success: true, subscribed: true });
  });

  it('rethrows DomainError from isSubscribed', async () => {
    const { isSubscribed } = await import('@/newsletter');

    (isSubscribed as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.NewsletterStatusFailed,
        message: 'domain failure',
        retryable: true,
      })
    );

    await expect(
      checkNewsletterStatusAction({
        parsedInput: { email },
        ctx: { user: { id: 'user_1', email } },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.NewsletterStatusFailed,
      retryable: true,
    });
  });

  it('wraps non-DomainError into NewsletterStatusFailed DomainError', async () => {
    const { isSubscribed } = await import('@/newsletter');

    (isSubscribed as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('unexpected')
    );

    await expect(
      checkNewsletterStatusAction({
        parsedInput: { email },
        ctx: { user: { id: 'user_1', email } },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.NewsletterStatusFailed,
      retryable: true,
    });
  });
});
