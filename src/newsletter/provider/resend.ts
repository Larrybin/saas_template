import { Resend } from 'resend';
import { serverEnv } from '@/env/server';
import { getLogger } from '@/lib/server/logger';
import type {
  CheckSubscribeStatusParams,
  NewsletterProvider,
  SubscribeNewsletterParams,
  UnsubscribeNewsletterParams,
} from '@/newsletter/types';

const logger = getLogger({ span: 'newsletter.resend-provider' });

/**
 * Implementation of the NewsletterProvider interface using Resend
 *
 * docs:
 * https://mksaas.com/docs/newsletter
 */
export class ResendNewsletterProvider implements NewsletterProvider {
  private resend: Resend;
  private audienceId: string;

  constructor() {
    if (!serverEnv.resendApiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set.');
    }
    if (!serverEnv.resendAudienceId) {
      throw new Error('RESEND_AUDIENCE_ID environment variable is not set.');
    }

    this.resend = new Resend(serverEnv.resendApiKey);
    this.audienceId = serverEnv.resendAudienceId;
  }

  /**
   * Get the provider name
   * @returns Provider name
   */
  public getProviderName(): string {
    return 'Resend';
  }

  /**
   * Subscribe a user to the newsletter
   * @param email The email address to subscribe
   * @returns True if the subscription was successful, false otherwise
   */
  async subscribe({ email }: SubscribeNewsletterParams): Promise<boolean> {
    try {
      // Check if the contact exists
      const getResult = await this.resend.contacts.get({
        email,
        audienceId: this.audienceId,
      });

      // If contact doesn't exist, create a new one
      if (getResult.error) {
        logger.info({ email }, 'Creating new newsletter contact');
        const createResult = await this.resend.contacts.create({
          email,
          audienceId: this.audienceId,
          unsubscribed: false,
        });

        if (createResult.error) {
          logger.error(
            { email, error: createResult.error },
            'Error creating newsletter contact'
          );
          return false;
        }
        logger.info({ email }, 'Created new newsletter contact');
        return true;
      }

      // If the contact exists, update it
      const updateResult = await this.resend.contacts.update({
        email,
        audienceId: this.audienceId,
        unsubscribed: false,
      });

      if (updateResult.error) {
        logger.error(
          { email, error: updateResult.error },
          'Error updating newsletter contact'
        );
        return false;
      }

      logger.info({ email }, 'Subscribed to newsletter');
      return true;
    } catch (error) {
      logger.error({ email, error }, 'Error subscribing to newsletter');
      return false;
    }
  }

  /**
   * Unsubscribe a user from the newsletter
   * @param email The email address to unsubscribe
   * @returns True if the unsubscription was successful, false otherwise
   */
  async unsubscribe({ email }: UnsubscribeNewsletterParams): Promise<boolean> {
    try {
      // console.log('Unsubscribing newsletter', email);
      const result = await this.resend.contacts.update({
        email,
        audienceId: this.audienceId,
        unsubscribed: true,
      });

      // console.log('Unsubscribe result:', result);
      if (result.error) {
        logger.error(
          { email, error: result.error },
          'Error unsubscribing newsletter contact'
        );
        return false;
      }

      logger.info({ email }, 'Unsubscribed from newsletter');
      return true;
    } catch (error) {
      logger.error({ email, error }, 'Error unsubscribing newsletter contact');
      return false;
    }
  }

  /**
   * Check if a user is subscribed to the newsletter
   * @param email The email address to check
   * @returns True if the user is subscribed, false otherwise
   */
  async checkSubscribeStatus({
    email,
  }: CheckSubscribeStatusParams): Promise<boolean> {
    try {
      const result = await this.resend.contacts.get({
        email,
        audienceId: this.audienceId,
      });

      if (result.error) {
        logger.error(
          { email, error: result.error },
          'Error fetching newsletter contact'
        );
        return false;
      }

      const status = !result.data?.unsubscribed;
      logger.debug({ email, status }, 'Newsletter subscribe status');
      return status;
    } catch (error) {
      logger.error({ email, error }, 'Error checking subscribe status');
      return false;
    }
  }
}
