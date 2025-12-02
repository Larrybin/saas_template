import { vi } from 'vitest';
import type {
  MailProvider,
  SendEmailResult,
  SendRawEmailParams,
  SendTemplateParams,
} from '@/mail/types';

export function createMailProviderStub(
  result: SendEmailResult = { success: true }
) {
  const sendTemplate = vi.fn<MailProvider['sendTemplate']>(async () => result);
  const sendRawEmail = vi.fn<MailProvider['sendRawEmail']>(async () => result);

  const provider: MailProvider = {
    getProviderName: () => 'test',
    sendTemplate,
    sendRawEmail,
  };

  return { provider, sendTemplate, sendRawEmail };
}

export function createRawEmailParams(
  overrides: Partial<SendRawEmailParams> = {}
): SendRawEmailParams {
  return {
    to: overrides.to ?? 'user@example.com',
    subject: overrides.subject ?? 'Subject',
    html: overrides.html ?? '<p>Hello</p>',
    ...(overrides.text ? { text: overrides.text } : {}),
  };
}

export function createTemplateEmailParams(
  overrides: Partial<SendTemplateParams> = {}
): SendTemplateParams {
  return {
    to: overrides.to ?? 'user@example.com',
    template: overrides.template ?? 'forgotPassword',
    context: overrides.context ?? { token: '123' },
    ...(overrides.locale ? { locale: overrides.locale } : {}),
  };
}
