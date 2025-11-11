export type PurchaseNotificationPayload = {
  sessionId: string;
  customerId: string;
  userName: string;
  amount: number;
};

export interface NotificationGateway {
  notifyPurchase(payload: PurchaseNotificationPayload): Promise<void>;
}
