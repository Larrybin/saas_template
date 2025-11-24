import { CreditLedgerService } from '@/credits/services/credit-ledger-service';
import { getPaymentProvider } from '@/payment';
import type { BillingService } from '@/domain/billing';
import {
  DefaultBillingService,
  DefaultPlanPolicy,
} from '@/domain/billing';

let billingServiceInstance: BillingService | null = null;

export const getBillingService = (): BillingService => {
  if (!billingServiceInstance) {
    billingServiceInstance = new DefaultBillingService({
      paymentProvider: getPaymentProvider(),
      creditsGateway: new CreditLedgerService(),
      planPolicy: new DefaultPlanPolicy(),
    });
  }
  return billingServiceInstance;
};
