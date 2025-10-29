import { sendMessageToDiscord } from './discord';
import { sendMessageToFeishu } from './feishu';

/**
 * Send a notification when a user makes a purchase
 * @param sessionId The Stripe checkout session ID
 * @param customerId The Stripe customer ID
 * @param userName The username of the customer
 * @param amount The purchase amount in the currency's main unit (e.g., dollars, not cents)
 */
export async function sendNotification(
  sessionId: string,
  customerId: string,
  userName: string,
  amount: number
): Promise<void> {
  console.log('sendNotification', sessionId, customerId, userName, amount);

  // Send message to Discord channel
  await sendMessageToDiscord(sessionId, customerId, userName, amount);

  // Send message to Feishu group
  await sendMessageToFeishu(sessionId, customerId, userName, amount);
}
