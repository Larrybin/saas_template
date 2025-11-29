import { describe, expect, it, vi } from 'vitest';

import { subscribeNewsletterAction } from '@/actions/subscribe-newsletter';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/lib/safe-action', () => ({
  actionClient: {
    schema: () => ({
      // In tests, expose the raw implementation instead of safe-action wrapper
      action: (impl: unknown) => impl,
    }),
  },
}));

vi.mock('@/newsletter', () => ({
  subscribe: vi.fn(),
}));

vi.mock('@/mail', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('en'),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

describe('subscribeNewsletterAction DomainError behavior', () => {
  const email = 'user@example.com';

  it('returns success when subscription and welcome email succeed', async () => {
    const { subscribe } = await import('@/newsletter');
    const { sendEmail } = await import('@/mail');

    (subscribe as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (sendEmail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );

    const result = await subscribeNewsletterAction({
      parsedInput: { email },
    } as never);

    expect(result).toEqual({ success: true });
  });

  it('throws DomainError when subscribe returns false', async () => {
    const { subscribe } = await import('@/newsletter');

    (subscribe as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(
      subscribeNewsletterAction({ parsedInput: { email } } as never)
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCodes.NewsletterSubscribeFailed,
      retryable: true,
    });
  });

  it('rethrows DomainError from subscribe', async () => {
    const { subscribe } = await import('@/newsletter');

    (subscribe as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DomainError({
        code: ErrorCodes.NewsletterSubscribeFailed,
        message: 'domain failure',
        retryable: true,
      })
    );

    await expect(
      subscribeNewsletterAction({ parsedInput: { email } } as never)
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCodes.NewsletterSubscribeFailed,
      retryable: true,
    });
  });

  it('wraps unexpected errors into NewsletterSubscribeFailed DomainError', async () => {
    const { subscribe } = await import('@/newsletter');

    (subscribe as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network failure')
    );

    await expect(
      subscribeNewsletterAction({ parsedInput: { email } } as never)
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCodes.NewsletterSubscribeFailed,
      retryable: true,
    });
  });
});
