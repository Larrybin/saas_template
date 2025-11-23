import {
  getPlanCreditsConfigByPlanId,
  getPlanCreditsConfigByPriceId,
  getRegisterGiftCreditsConfig,
} from '../config';
import { CreditLedgerRepository } from '../data-access/credit-ledger-repository';
import type { DbExecutor } from '../data-access/types';
import { CreditLedgerDomainService } from '../domain/credit-ledger-domain-service';
import { CREDIT_TRANSACTION_TYPE } from '../types';
import { getCurrentPeriodKey, getPeriodKey } from '../utils/period-key';
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
  const executor = resolveExecutor(transaction);
  await creditLedgerDomainService.addCredits(payload, executor);
}

export async function addCreditsWithExecutor(
  payload: AddCreditsPayload,
  executor: DbExecutor
) {
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
  periodKey?: number,
  executor?: DbExecutor
) {
  const effectivePeriodKey = periodKey ?? getCurrentPeriodKey();
  return creditLedgerDomainService.canAddCreditsByType(
    userId,
    creditType,
    effectivePeriodKey,
    executor
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
  const config = getRegisterGiftCreditsConfig();
  if (!config || !config.enabled) {
    return;
  }

  const credits = config.amount;
  const expireDays = config.expireDays;
  const payload: AddCreditsPayload = {
    userId,
    amount: credits,
    type: CREDIT_TRANSACTION_TYPE.REGISTER_GIFT,
    description: `Register gift credits: ${credits}`,
    ...(expireDays !== undefined ? { expireDays } : {}),
  };
  await addCredits(payload);
}

export async function addMonthlyFreeCredits(
  userId: string,
  planId: string,
  refDate?: Date
) {
  const config = getPlanCreditsConfigByPlanId(planId);
  if (!config || config.disabled || !config.isFree || !config.enabled) {
    return;
  }
  const periodKey = getCurrentPeriodKey(refDate);
  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
    periodKey
  );
  if (!canAdd) return;
  const credits = config.amount;
  const expireDays = config.expireDays;
  const payload: AddCreditsPayload = {
    userId,
    amount: credits,
    type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
    description: `Free monthly credits: ${credits}`,
    periodKey,
    ...(expireDays !== undefined ? { expireDays } : {}),
  };
  await addCredits(payload);
}

export async function addSubscriptionCredits(
  userId: string,
  priceId: string,
  cycleRefDate?: Date,
  transaction?: CreditsTransaction
) {
  const config = getPlanCreditsConfigByPriceId(priceId);
  if (!config || !config.enabled) {
    return;
  }
  const refDate = cycleRefDate ?? new Date();
  const periodKey = getPeriodKey(refDate);
  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
    periodKey
  );
  if (!canAdd) return;
  const payload: AddCreditsPayload = {
    userId,
    amount: config.amount,
    type: CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
    description: `Subscription renewal credits: ${config.amount}`,
    periodKey,
    ...(config.expireDays !== undefined
      ? { expireDays: config.expireDays }
      : {}),
  };
  await addCredits(payload, transaction);
}

export async function addLifetimeMonthlyCredits(
  userId: string,
  priceId: string,
  cycleRefDate?: Date,
  transaction?: CreditsTransaction
) {
  const config = getPlanCreditsConfigByPriceId(priceId);
  if (!config || !config.isLifetime || config.disabled || !config.enabled) {
    return;
  }
  const refDate = cycleRefDate ?? new Date();
  const periodKey = getPeriodKey(refDate);
  const canAdd = await canAddCreditsByType(
    userId,
    CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
    periodKey
  );
  if (!canAdd) return;
  const payload: AddCreditsPayload = {
    userId,
    amount: config.amount,
    type: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
    description: `Lifetime monthly credits: ${config.amount}`,
    periodKey,
    ...(config.expireDays !== undefined
      ? { expireDays: config.expireDays }
      : {}),
  };
  await addCredits(payload, transaction);
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
    cycleRefDate: Date,
    transaction?: CreditsTransaction
  ): Promise<void> {
    await addSubscriptionCredits(userId, priceId, cycleRefDate, transaction);
  }

  async addLifetimeMonthlyCredits(
    userId: string,
    priceId: string,
    cycleRefDate: Date,
    transaction?: CreditsTransaction
  ): Promise<void> {
    await addLifetimeMonthlyCredits(userId, priceId, cycleRefDate, transaction);
  }
}
