export type AddCreditsPayload = {
  userId: string;
  amount: number;
  type: string;
  description: string;
  paymentId?: string;
  expireDays?: number;
};

import type { DbExecutor } from '../data-access/credit-ledger-repository';

export interface CreditsGateway {
  addCredits(payload: AddCreditsPayload, db?: DbExecutor): Promise<void>;
  addSubscriptionCredits(
    userId: string,
    priceId: string,
    db?: DbExecutor
  ): Promise<void>;
  addLifetimeMonthlyCredits(
    userId: string,
    priceId: string,
    db?: DbExecutor
  ): Promise<void>;
}
