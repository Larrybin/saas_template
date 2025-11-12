import { websiteConfig } from '@/config/website';
import { findPlanByPlanId, findPlanByPriceId } from '@/lib/price-plan';
import { CreditLedgerRepository } from '../data-access/credit-ledger-repository';
import type { DbExecutor } from '../data-access/types';
import { CreditLedgerDomainService } from '../domain/credit-ledger-domain-service';
import { CREDIT_TRANSACTION_TYPE } from '../types';
import type { AddCreditsPayload, CreditsGateway } from './credits-gateway';
import type { CreditsTransaction } from './transaction-context';
import { resolveExecutor } from './transaction-context';

export const creditLedgerRepository = new CreditLedgerRepository();
const creditLedgerDomainService = new CreditLedgerDomainService(
  creditLedgerRepository
);

export async function getUserCredits(userId: string): Promise<number> {
  try {
    return await creditLedgerDomainService.getUserCredits(userId);
  } catch (error) {
    console.error('getUserCredits, error:', error);
    return 0;
  }
}

export async function updateUserCredits(userId: string, credits: number) {
  try {
    await creditLedgerDomainService.updateUserCredits(userId, credits);
  } catch (error) {
    console.error('updateUserCredits, error:', error);
  }
}

export async function addCredits(
  payload: AddCreditsPayload,
  transaction?: CreditsTransaction
) {
  const executor = resolveExecutor<DbExecutor>(transaction);
  await creditLedgerDomainService.addCredits(payload, executor);
}

export async function hasEnoughCredits(options: {
  userId: string;
  requiredCredits: number;
}) {
  return creditLedgerDomainService.hasEnoughCredits(
    options.userId,
    options.requiredCredits
  );
}

export async function consumeCredits(payload: {
  userId: string;
  amount: number;
  description: string;
}) {
  await creditLedgerDomainService.consumeCredits(payload);
}

export async function processExpiredCredits(userId: string) {
  await creditLedgerDomainService.processExpiredCredits(userId);
}

export async function canAddCreditsByType(
  userId: string,
  creditType: string,
  periodKey?: number
) {
  return creditLedgerDomainService.canAddCreditsByType(
    userId,
    creditType,
    undefined,
    periodKey
  );
}

export async function addRegisterGiftCredits(userId: string) {
  const alreadyGranted = await creditLedgerDomainService.hasTransactionOfType(
    userId,
    CREDIT_TRANSACTION_TYPE.REGISTER_GIFT
  );
  if (alreadyGranted) {
    return;
  }
  const credits = websiteConfig.credits.registerGiftCredits.amount;
  const expireDays = websiteConfig.credits.registerGiftCredits.expireDays;
  await addCredits({
    userId,
    amount: credits,
    type: CREDIT_TRANSACTION_TYPE.REGISTER_GIFT,
    description: `Register gift credits: ${credits}`,
    expireDays,
  });
}

export async function addMonthlyFreeCredits(userId: string, planId: string) {
  const pricePlan = findPlanByPlanId(planId);
  if (
    !pricePlan ||
    pricePlan.disabled ||
    !pricePlan.isFree ||
    !pricePlan.credits?.enable
  ) {
    return;
  }
  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH
  );
  if (!canAdd) return;
  const credits = pricePlan.credits.amount ?? 0;
  const expireDays = pricePlan.credits.expireDays;
  await addCredits({
    userId,
    amount: credits,
    type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
    description: `Free monthly credits: ${credits}`,
    expireDays,
  });
}

export async function addSubscriptionCredits(
  userId: string,
  priceId: string,
  transaction?: CreditsTransaction
) {
  const plan = findPlanByPriceId(priceId);
  if (!plan?.credits?.enable) {
    return;
  }
  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL
  );
  if (!canAdd) return;
  await addCredits(
    {
      userId,
      amount: plan.credits.amount,
      type: CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      description: `Subscription renewal credits: ${plan.credits.amount}`,
      expireDays: plan.credits.expireDays,
    },
    transaction
  );
}

export async function addLifetimeMonthlyCredits(
  userId: string,
  priceId: string,
  transaction?: CreditsTransaction
) {
  const plan = findPlanByPriceId(priceId);
  if (!plan?.isLifetime || plan.disabled || !plan.credits?.enable) {
    return;
  }
  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY
  );
  if (!canAdd) return;
  await addCredits(
    {
      userId,
      amount: plan.credits.amount,
      type: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
      description: `Lifetime monthly credits: ${plan.credits.amount}`,
      expireDays: plan.credits.expireDays,
    },
    transaction
  );
}

export class CreditLedgerService implements CreditsGateway {
  async addCredits(
    payload: AddCreditsPayload,
    transaction?: CreditsTransaction
  ): Promise<void> {
    await addCredits(payload, transaction);
  }

  async addSubscriptionCredits(
    userId: string,
    priceId: string,
    transaction?: CreditsTransaction
  ): Promise<void> {
    await addSubscriptionCredits(userId, priceId, transaction);
  }

  async addLifetimeMonthlyCredits(
    userId: string,
    priceId: string,
    transaction?: CreditsTransaction
  ): Promise<void> {
    await addLifetimeMonthlyCredits(userId, priceId, transaction);
  }
}
