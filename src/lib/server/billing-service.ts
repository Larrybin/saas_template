import { websiteConfig } from '@/config/website';
import { CreditLedgerService } from '@/credits/services/credit-ledger-service';
import type { BillingService, BillingServiceDeps } from '@/domain/billing';
import { DefaultBillingService, DefaultPlanPolicy } from '@/domain/billing';
import { getPaymentProvider } from '@/payment';

type BillingServiceFactoryOverrides = Partial<BillingServiceDeps>;

let billingServiceInstance: BillingService | null = null;

export const createBillingService = (
  overrides: BillingServiceFactoryOverrides = {}
): BillingService => {
  return new DefaultBillingService({
    paymentProvider: overrides.paymentProvider ?? getPaymentProvider(),
    creditsGateway: overrides.creditsGateway ?? new CreditLedgerService(),
    planPolicy: overrides.planPolicy ?? new DefaultPlanPolicy(),
    creditsEnabled:
      overrides.creditsEnabled ?? websiteConfig.credits?.enableCredits ?? false,
  });
};

export const getBillingService = (
  overrides?: BillingServiceFactoryOverrides
): BillingService => {
  if (overrides) {
    return createBillingService(overrides);
  }
  if (!billingServiceInstance) {
    billingServiceInstance = createBillingService();
  }
  return billingServiceInstance;
};
