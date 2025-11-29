import { describe, expect, it, vi } from 'vitest';

import { sendMessageAction } from '@/actions/send-message';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

vi.mock('@/lib/safe-action', () => ({
  actionClient: {
    schema: () => ({
      // 在测试中直接暴露内部实现，绕过 safe-action 封装
      action: (impl: unknown) => impl,
    }),
  },
}));

vi.mock('@/config/website', () => ({
  websiteConfig: {
    mail: {
      supportEmail: 'support@example.com',
    },
  },
}));

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('en'),
}));

vi.mock('@/mail', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

describe('sendMessageAction DomainError behavior', () => {
  const baseInput = {
    name: 'User',
    email: 'user@example.com',
    message: 'Hello from contact form',
  };

  it('returns success when email send succeeds', async () => {
    const { sendEmail } = await import('@/mail');

    (sendEmail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      true
    );

    const result = await sendMessageAction({
      parsedInput: baseInput,
    } as never);

    expect(result).toEqual({ success: true });
  });

  it('throws DomainError when sendEmail returns falsy', async () => {
    const { sendEmail } = await import('@/mail');

    (sendEmail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      false
    );

    await expect(
      sendMessageAction({
        parsedInput: baseInput,
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.ContactSendFailed,
      retryable: true,
    });
  });

  it('rethrows DomainError from sendEmail', async () => {
    const { sendEmail } = await import('@/mail');

    (sendEmail as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DomainError({
        code: ErrorCodes.ContactSendFailed,
        message: 'domain failure',
        retryable: true,
      })
    );

    await expect(
      sendMessageAction({
        parsedInput: baseInput,
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.ContactSendFailed,
      retryable: true,
    });
  });

  it('wraps non-DomainError into ContactSendFailed DomainError', async () => {
    const { sendEmail } = await import('@/mail');

    (sendEmail as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('unexpected')
    );

    await expect(
      sendMessageAction({
        parsedInput: baseInput,
      } as never)
    ).rejects.toMatchObject({
      code: ErrorCodes.ContactSendFailed,
      retryable: true,
    });
  });
});
