import { describe, expect, it, vi } from 'vitest';
import '../helpers/actions';

import { unsubscribeNewsletterAction } from '@/actions/unsubscribe-newsletter';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/newsletter', () => ({
  unsubscribe: vi.fn(),
}));

describe('unsubscribeNewsletterAction DomainError behavior', () => {
  const email = 'user@example.com';

  it('returns success when unsubscription succeeds', async () => {
    const { unsubscribe } = await import('@/newsletter');

    (unsubscribe as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      true
    );

    const result = await unsubscribeNewsletterAction({
      parsedInput: { email },
      ctx: { user: { id: 'user_1', email: 'user@example.com' } },
    } as never);

    expect(result).toEqual({ success: true });
  });

  it('throws DomainError when unsubscribe returns false', async () => {
    const { unsubscribe } = await import('@/newsletter');

    (unsubscribe as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      false
    );

    await expect(
      unsubscribeNewsletterAction({
        parsedInput: { email },
        ctx: { user: { id: 'user_1', email: 'user@example.com' } },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.NewsletterUnsubscribeFailed,
      retryable: true,
    });
  });

  it('rethrows DomainError from unsubscribe', async () => {
    const { unsubscribe } = await import('@/newsletter');

    (unsubscribe as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.NewsletterUnsubscribeFailed,
        message: 'domain failure',
        retryable: true,
      })
    );

    await expect(
      unsubscribeNewsletterAction({
        parsedInput: { email },
        ctx: { user: { id: 'user_1', email: 'user@example.com' } },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.NewsletterUnsubscribeFailed,
      retryable: true,
    });
  });

  it('wraps non-DomainError into NewsletterUnsubscribeFailed DomainError', async () => {
    const { unsubscribe } = await import('@/newsletter');

    (unsubscribe as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('unexpected')
    );

    await expect(
      unsubscribeNewsletterAction({
        parsedInput: { email },
        ctx: { user: { id: 'user_1', email: 'user@example.com' } },
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.NewsletterUnsubscribeFailed,
      retryable: true,
    });
  });
});
