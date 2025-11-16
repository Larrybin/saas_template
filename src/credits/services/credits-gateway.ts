import { CREDIT_TRANSACTION_TYPE } from '../types';
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

export type PeriodicAddCreditsPayload = AddCreditsPayload & {
  type:
    | CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH
    | CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL
    | CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY;
  periodKey: number;
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
