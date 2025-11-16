import type { CreditsTransaction } from './transaction-context';

export type AddCreditsPayload = {
  userId: string;
  amount: number;
  type: string;
  description: string;
  paymentId?: string;
  expireDays?: number;
  periodKey?: number;
};

export interface CreditsGateway {
  addCredits(
    payload: AddCreditsPayload,
    transaction?: CreditsTransaction
  ): Promise<void>;
  addSubscriptionCredits(
    userId: string,
    priceId: string,
    cycleRefDate: Date,
    transaction?: CreditsTransaction
  ): Promise<void>;
  addLifetimeMonthlyCredits(
    userId: string,
    priceId: string,
    cycleRefDate: Date,
    transaction?: CreditsTransaction
  ): Promise<void>;
}
