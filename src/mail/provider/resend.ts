import { Resend } from 'resend';
import { websiteConfig } from '@/config/website';
import { serverEnv } from '@/env/server';
import { getLogger } from '@/lib/logger';
import { getTemplate } from '@/mail';
import type {
  MailProvider,
  SendEmailResult,
  SendRawEmailParams,
  SendTemplateParams,
} from '@/mail/types';

/**
 * Resend mail provider implementation
 *
 * docs:
 * https://mksaas.com/docs/email
 */
export class ResendProvider implements MailProvider {
  private resend: Resend;
  private from: string;
  private readonly logger = getLogger({ span: 'mail.resend' });

  /**
   * Initialize Resend provider with API key
   */
  constructor() {
    if (!serverEnv.resendApiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set.');
    }

    if (!websiteConfig.mail.fromEmail) {
      throw new Error(
        'Default from email address is not set in websiteConfig.'
      );
    }

    this.resend = new Resend(serverEnv.resendApiKey);
    this.from = websiteConfig.mail.fromEmail;
  }

  /**
   * Get the provider name
   * @returns Provider name
   */
  public getProviderName(): string {
    return 'resend';
  }

  /**
   * Send an email using a template
   * @param params Parameters for sending a templated email
   * @returns Send result
   */
  public async sendTemplate(
    params: SendTemplateParams
  ): Promise<SendEmailResult> {
    const { to, template, context, locale } = params;

    try {
      // Get rendered template
      const mailTemplate = await getTemplate({
        template,
        context,
        locale,
      });

      // Send using raw email
      return this.sendRawEmail({
        to,
        subject: mailTemplate.subject,
        html: mailTemplate.html,
        text: mailTemplate.text,
      });
    } catch (error) {
      this.logger.error({ error }, 'Error sending template email');
      return {
        success: false,
        error,
      };
    }
  }

  /**
   * Send a raw email
   * @param params Parameters for sending a raw email
   * @returns Send result
   */
  public async sendRawEmail(
    params: SendRawEmailParams
  ): Promise<SendEmailResult> {
    const { to, subject, html, text } = params;

    if (!this.from || !to || !subject || !html) {
      this.logger.warn('Missing required fields for email send', {
        from: this.from,
        to,
        subject,
      });
      return {
        success: false,
        error: 'Missing required fields',
      };
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
        text,
      });

      if (error) {
        this.logger.error({ error }, 'Error sending email');
        return {
          success: false,
          error,
        };
      }

      return {
        success: true,
        messageId: data?.id,
      };
    } catch (error) {
      this.logger.error({ error }, 'Error sending email');
      return {
        success: false,
        error,
      };
    }
  }
}
