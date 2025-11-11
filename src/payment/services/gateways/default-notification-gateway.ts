import { sendNotification } from '@/notification/notification';
import type {
  NotificationGateway,
  PurchaseNotificationPayload,
} from './notification-gateway';

export class DefaultNotificationGateway implements NotificationGateway {
  async notifyPurchase({
    sessionId,
    customerId,
    userName,
    amount,
  }: PurchaseNotificationPayload): Promise<void> {
    await sendNotification(sessionId, customerId, userName, amount);
  }
}
