import { getLogger } from '@/lib/server/logger';
import { CreditLedgerRepository } from '../data-access/credit-ledger-repository';
import type { DbExecutor } from '../data-access/types';
import { CreditLedgerDomainService } from '../domain/credit-ledger-domain-service';
import {
  DefaultPlanCreditsPolicy,
  type PlanCreditsPolicy,
} from '../domain/plan-credits-policy';
import { CREDIT_TRANSACTION_TYPE } from '../types';
import { getCurrentPeriodKey, getPeriodKey } from '../utils/period-key';
import type { AddCreditsPayload, CreditsGateway } from './credits-gateway';
import type { CreditsTransaction } from './transaction-context';
import { resolveExecutor } from './transaction-context';

export const creditLedgerRepository = new CreditLedgerRepository();
const creditLedgerDomainService = new CreditLedgerDomainService(
  creditLedgerRepository
);
const creditsServiceLogger = getLogger({ span: 'credits.service' });
const defaultPlanCreditsPolicy = new DefaultPlanCreditsPolicy();

export async function getUserCredits(userId: string): Promise<number> {
  try {
    return await creditLedgerDomainService.getUserCredits(userId);
  } catch (error) {
    creditsServiceLogger.error(
      { error, userId },
      'getUserCredits failed to resolve balance'
    );
    throw error;
  }
}

export async function updateUserCredits(userId: string, credits: number) {
  try {
    await creditLedgerDomainService.updateUserCredits(userId, credits);
  } catch (error) {
    creditsServiceLogger.error({ error, userId }, 'updateUserCredits failed');
    throw error;
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
  await defaultCreditLedgerService.addRegisterGiftCredits(userId);
}

export async function addMonthlyFreeCredits(
  userId: string,
  planId: string,
  refDate?: Date
) {
  await defaultCreditLedgerService.addMonthlyFreeCredits(
    userId,
    planId,
    refDate
  );
}

export async function addSubscriptionCredits(
  userId: string,
  priceId: string,
  cycleRefDate?: Date,
  transaction?: CreditsTransaction
) {
  await defaultCreditLedgerService.addSubscriptionCredits(
    userId,
    priceId,
    cycleRefDate ?? new Date(),
    transaction
  );
}

export async function addLifetimeMonthlyCredits(
  userId: string,
  priceId: string,
  cycleRefDate?: Date,
  transaction?: CreditsTransaction
) {
  await defaultCreditLedgerService.addLifetimeMonthlyCredits(
    userId,
    priceId,
    cycleRefDate ?? new Date(),
    transaction
  );
}

export class CreditLedgerService implements CreditsGateway {
  constructor(
    private readonly policy: PlanCreditsPolicy = defaultPlanCreditsPolicy
  ) {}

  async addCredits(
    payload: AddCreditsPayload,
    transaction?: CreditsTransaction
  ): Promise<void> {
    await addCredits(payload, transaction);
  }

  async addRegisterGiftCredits(userId: string): Promise<void> {
    const alreadyGranted = await creditLedgerDomainService.hasTransactionOfType(
      userId,
      CREDIT_TRANSACTION_TYPE.REGISTER_GIFT
    );
    if (alreadyGranted) {
      return;
    }
    const rule = this.policy.getRegisterGiftRule();
    if (!rule) {
      return;
    }

    const credits = rule.amount;
    const expireDays = rule.expireDays;
    const payload: AddCreditsPayload = {
      userId,
      amount: credits,
      type: CREDIT_TRANSACTION_TYPE.REGISTER_GIFT,
      description: `Register gift credits: ${credits}`,
      ...(expireDays !== undefined ? { expireDays } : {}),
    };
    await addCredits(payload);
  }

  async addMonthlyFreeCredits(
    userId: string,
    planId: string,
    refDate?: Date
  ): Promise<void> {
    const rule = this.policy.getMonthlyFreeRule(planId);
    if (!rule) {
      return;
    }
    const periodKey = getCurrentPeriodKey(refDate);
    const canAdd = await canAddCreditsByType(
      userId,
      CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
      periodKey
    );
    if (!canAdd) return;
    const credits = rule.amount;
    const expireDays = rule.expireDays;
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

  async addSubscriptionCredits(
    userId: string,
    priceId: string,
    cycleRefDate: Date,
    transaction?: CreditsTransaction
  ): Promise<void> {
    const rule = this.policy.getSubscriptionRenewalRule(priceId);
    if (!rule) {
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
      amount: rule.amount,
      type: CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      description: `Subscription renewal credits: ${rule.amount}`,
      periodKey,
      ...(rule.expireDays !== undefined ? { expireDays: rule.expireDays } : {}),
    };
    await addCredits(payload, transaction);
  }

  async addLifetimeMonthlyCredits(
    userId: string,
    priceId: string,
    cycleRefDate: Date,
    transaction?: CreditsTransaction
  ): Promise<void> {
    const rule = this.policy.getLifetimeMonthlyRule(priceId);
    if (!rule) {
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
      amount: rule.amount,
      type: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
      description: `Lifetime monthly credits: ${rule.amount}`,
      periodKey,
      ...(rule.expireDays !== undefined ? { expireDays: rule.expireDays } : {}),
    };
    await addCredits(payload, transaction);
  }
}

export const defaultCreditLedgerService = new CreditLedgerService();
