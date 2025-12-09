import { websiteConfig } from '@/config/website';
import { serverEnv } from '@/env/server';
import { defaultMessages } from '@/i18n/messages';
import { getLogger } from '@/lib/server/logger';
import { withRetry } from '@/lib/server/retry';
import { getBaseUrl } from '@/lib/urls/urls';

const logger = getLogger({ span: 'notification.discord' });

/**
 * Send a message to Discord when a user makes a purchase
 * @param sessionId The Stripe checkout session ID
 * @param customerId The Stripe customer ID
 * @param userName The username of the customer
 * @param amount The purchase amount in the currency's main unit (e.g., dollars, not cents)
 */
export async function sendMessageToDiscord(
  sessionId: string,
  customerId: string,
  userName: string,
  amount: number
): Promise<void> {
  try {
    const webhookUrl = serverEnv.discordWebhookUrl;

    if (!webhookUrl) {
      logger.warn(
        'DISCORD_WEBHOOK_URL is not set, skipping Discord notification'
      );
      return;
    }

    // Format the message
    const message = {
      // You can customize these values later
      username: `${defaultMessages.Metadata.name} Bot`,
      avatar_url: `${getBaseUrl()}${websiteConfig.metadata?.images?.logoLight}`,
      embeds: [
        {
          title: '🎉 New Purchase',
          color: 0x4caf50, // Green color
          fields: [
            {
              name: 'Username',
              value: userName,
              inline: true,
            },
            {
              name: 'Amount',
              value: `$${amount.toFixed(2)}`,
              inline: true,
            },
            {
              name: 'Customer ID',
              value: `\`${customerId}\``,
              inline: false,
            },
            {
              name: 'Session ID',
              value: `\`${sessionId}\``,
              inline: false,
            },
            {
              name: 'Source',
              value: getBaseUrl(),
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    await withRetry(
      'notification.discord.send',
      async (attempt) => {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        if (!response.ok) {
          const context = {
            userName,
            status: response.status,
            attempt,
          };

          if (response.status >= 500) {
            logger.error(
              context,
              'Failed to send Discord notification, will retry if attempts remain'
            );
            throw new Error(
              `Discord webhook responded with status ${response.status}`
            );
          }

          logger.error(
            context,
            'Failed to send Discord notification (non-retryable status)'
          );
          return;
        }

        logger.info(
          { userName, attempt },
          'Successfully sent Discord notification'
        );
      },
      {
        logger,
        logContext: { userName },
      }
    );
  } catch (error) {
    logger.error(
      { error, userName },
      'Failed to send Discord notification after retries'
    );
    // Don't rethrow the error to avoid interrupting the payment flow
  }
}
