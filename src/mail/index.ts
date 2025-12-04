import { render } from '@react-email/render';
import type { Locale, Messages } from 'next-intl';
import type { ReactElement } from 'react';
import { getMessagesForLocale } from '@/i18n/messages';
import { routing } from '@/i18n/routing';
import { mailConfigProvider } from './mail-config-provider';
import { ResendProvider } from './provider/resend';
import {
  type EmailTemplate,
  EmailTemplates,
  type MailProvider,
  type SendRawEmailParams,
  type SendTemplateParams,
  type TemplateContextMap,
} from './types';

/**
 * Global mail provider instance
 */
let mailProvider: MailProvider | null = null;

/**
 * Get the mail provider
 * @returns current mail provider instance
 * @throws Error if provider is not initialized
 */
export const getMailProvider = (): MailProvider => {
  if (!mailProvider) {
    return initializeMailProvider();
  }
  return mailProvider;
};

/**
 * Initialize the mail provider
 * @returns initialized mail provider
 */
export const initializeMailProvider = (): MailProvider => {
  if (!mailProvider) {
    const mailConfig = mailConfigProvider.getMailConfig();
    if (mailConfig.provider === 'resend') {
      mailProvider = new ResendProvider();
    } else {
      throw new Error(`Unsupported mail provider: ${mailConfig.provider}`);
    }
  }
  return mailProvider;
};

/**
 * Send email using the configured mail provider
 *
 * @param params Email parameters
 * @returns Success status
 */
export async function sendEmail(
  params: SendTemplateParams | SendRawEmailParams
) {
  const provider = getMailProvider();

  if ('template' in params) {
    // This is a template email
    const result = await provider.sendTemplate(params);
    return result.success;
  }
  // This is a raw email
  const result = await provider.sendRawEmail(params);
  return result.success;
}

/**
 * Get rendered email for given template, context, and locale
 */
export async function getTemplate<T extends EmailTemplate>({
  template,
  context,
  locale = routing.defaultLocale,
}: {
  template: T;
  context: TemplateContextMap[T];
  locale?: Locale;
}) {
  const mainTemplate = EmailTemplates[template];
  const messages = await getMessagesForLocale(locale);

  const props: TemplateContextMap[T] & {
    locale: Locale;
    messages: Messages;
  } = {
    ...(context as TemplateContextMap[T]),
    locale,
    messages,
  };

  const email = (
    mainTemplate as (
      p: TemplateContextMap[T] & { locale: Locale; messages: Messages }
    ) => ReactElement
  )(props);

  // Get the subject from the messages
  const subject =
    'subject' in messages.Mail[template as keyof Messages['Mail']]
      ? messages.Mail[template].subject
      : '';

  const html = await render(email);
  const text = await render(email, { plainText: true });

  return { html, text, subject };
}
