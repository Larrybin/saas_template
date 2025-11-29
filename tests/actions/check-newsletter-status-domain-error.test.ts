import { describe, expect, it, vi } from 'vitest';

import { checkNewsletterStatusAction } from '@/actions/check-newsletter-status';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/lib/safe-action', () => ({
  userActionClient: {
    schema: () => ({
      // 在测试中直接暴露内部实现，绕过 safe-action 封装
      action: (impl: unknown) => impl,
    }),
  },
}));

vi.mock('@/newsletter', () => ({
  isSubscribed: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
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
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.NewsletterStatusFailed,
      retryable: true,
    });
  });
});
