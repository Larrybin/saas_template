export type AddCreditsPayload = {
  userId: string;
  amount: number;
  type: string;
  description: string;
  paymentId?: string;
  expireDays?: number;
};

export interface CreditsGateway {
  addCredits(payload: AddCreditsPayload): Promise<void>;
  addSubscriptionCredits(userId: string, priceId: string): Promise<void>;
  addLifetimeMonthlyCredits(userId: string, priceId: string): Promise<void>;
}
