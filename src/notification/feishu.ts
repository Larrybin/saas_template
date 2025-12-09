/**
 * Send a message to Feishu when a user makes a purchase
 * @param sessionId The Stripe checkout session ID
 * @param customerId The Stripe customer ID
 * @param userName The username of the customer
 * @param amount The purchase amount in the currency's main unit (e.g., dollars, not cents)
 */
import { serverEnv } from '@/env/server';
import { getLogger } from '@/lib/server/logger';
import { withRetry } from '@/lib/server/retry';
import { getBaseUrl } from '@/lib/urls/urls';

const logger = getLogger({ span: 'notification.feishu' });

export async function sendMessageToFeishu(
  sessionId: string,
  customerId: string,
  userName: string,
  amount: number
): Promise<void> {
  try {
    const webhookUrl = serverEnv.feishuWebhookUrl;

    if (!webhookUrl) {
      logger.warn(
        'FEISHU_WEBHOOK_URL is not set, skipping Feishu notification'
      );
      return;
    }

    // Format the message
    const message = {
      msg_type: 'text',
      content: {
        text: `🎉 New Purchase\nUsername: ${userName}\nAmount: $${amount.toFixed(2)}\nCustomer ID: ${customerId}\nSession ID: ${sessionId}\nSource: ${getBaseUrl()}`,
      },
    };

    await withRetry(
      'notification.feishu.send',
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
              'Failed to send Feishu notification, will retry if attempts remain'
            );
            throw new Error(
              `Feishu webhook responded with status ${response.status}`
            );
          }

          logger.error(
            context,
            'Failed to send Feishu notification (non-retryable status)'
          );
          return;
        }

        logger.info(
          { userName, attempt },
          'Successfully sent Feishu notification'
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
      'Failed to send Feishu notification after retries'
    );
    // Don't rethrow the error to avoid interrupting the payment flow
  }
}
