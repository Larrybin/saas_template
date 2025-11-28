import { getLogger, type Logger } from '@/lib/server/logger';
import { CreditLedgerRepository } from '../data-access/credit-ledger-repository';
import type { DbExecutor } from '../data-access/types';
import { CreditLedgerDomainService } from '../domain/credit-ledger-domain-service';
import { CreditsPlanPolicyMissingError } from '../domain/errors';
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
export const creditLedgerDomainService = new CreditLedgerDomainService(
  creditLedgerRepository
);
const creditsServiceLogger = getLogger({ span: 'credits.service' });
const defaultPlanCreditsPolicy = new DefaultPlanCreditsPolicy();

export async function getUserCredits(userId: string): Promise<number> {
  return defaultCreditLedgerService.getUserCredits(userId);
}

export async function updateUserCredits(userId: string, credits: number) {
  await defaultCreditLedgerService.updateUserCredits(userId, credits);
}

export async function addCredits(
  payload: AddCreditsPayload,
  transaction?: CreditsTransaction
) {
  await defaultCreditLedgerService.addCredits(payload, transaction);
}

export async function addCreditsWithExecutor(
  payload: AddCreditsPayload,
  executor: DbExecutor
) {
  await defaultCreditLedgerService.addCreditsWithExecutor(payload, executor);
}

export async function hasEnoughCredits(options: {
  userId: string;
  requiredCredits: number;
}) {
  return defaultCreditLedgerService.hasEnoughCredits(options);
}

export async function consumeCredits(payload: {
  userId: string;
  amount: number;
  description: string;
}) {
  await defaultCreditLedgerService.consumeCredits(payload);
}

export async function processExpiredCredits(userId: string) {
  await defaultCreditLedgerService.processExpiredCredits(userId);
}

export async function canAddCreditsByType(
  userId: string,
  creditType: string,
  periodKey?: number,
  executor?: DbExecutor
) {
  return defaultCreditLedgerService.canAddCreditsByType(
    userId,
    creditType,
    periodKey,
    executor
  );
}

export class CreditLedgerService implements CreditsGateway {
  constructor(
    private readonly policy: PlanCreditsPolicy = defaultPlanCreditsPolicy,
    private readonly domainService: CreditLedgerDomainService = creditLedgerDomainService,
    private readonly logger: Pick<
      Logger,
      'info' | 'warn' | 'error'
    > = creditsServiceLogger
  ) {}

  async addCredits(
    payload: AddCreditsPayload,
    transaction?: CreditsTransaction
  ): Promise<void> {
    const executor = resolveExecutor(transaction);
    await this.domainService.addCredits(payload, executor);
  }

  async addCreditsWithExecutor(
    payload: AddCreditsPayload,
    executor: DbExecutor
  ): Promise<void> {
    await this.domainService.addCredits(payload, executor);
  }

  async hasEnoughCredits(options: {
    userId: string;
    requiredCredits: number;
  }): Promise<boolean> {
    return this.domainService.hasEnoughCredits(
      options.userId,
      options.requiredCredits
    );
  }

  async consumeCredits(payload: {
    userId: string;
    amount: number;
    description: string;
  }): Promise<void> {
    await this.domainService.consumeCredits(payload);
  }

  async processExpiredCredits(userId: string): Promise<void> {
    await this.domainService.processExpiredCredits(userId);
  }

  async canAddCreditsByType(
    userId: string,
    creditType: string,
    periodKey?: number,
    executor?: DbExecutor
  ): Promise<boolean> {
    const effectivePeriodKey = periodKey ?? getCurrentPeriodKey();
    return this.domainService.canAddCreditsByType(
      userId,
      creditType,
      effectivePeriodKey,
      executor
    );
  }

  async addRegisterGiftCredits(userId: string): Promise<void> {
    const alreadyGranted = await this.domainService.hasTransactionOfType(
      userId,
      CREDIT_TRANSACTION_TYPE.REGISTER_GIFT
    );
    if (alreadyGranted) {
      return;
    }
    const rule = this.policy.getRegisterGiftRule();
    if (!rule) {
      this.logger.info(
        { userId, type: CREDIT_TRANSACTION_TYPE.REGISTER_GIFT },
        'Register gift credits rule not found, skipping grant'
      );
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
    await this.addCredits(payload);
  }

  async addMonthlyFreeCredits(
    userId: string,
    planId: string,
    refDate?: Date
  ): Promise<void> {
    const rule = this.policy.getMonthlyFreeRule(planId);
    if (!rule) {
      this.logger.info(
        { userId, planId, type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH },
        'Monthly free credits rule not found for plan, skipping grant'
      );
      return;
    }
    const periodKey = getCurrentPeriodKey(refDate);
    const canAdd = await this.canAddCreditsByType(
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
    await this.addCredits(payload);
  }

  async addSubscriptionCredits(
    userId: string,
    priceId: string,
    cycleRefDate: Date,
    transaction?: CreditsTransaction
  ): Promise<void> {
    const rule = this.policy.getSubscriptionRenewalRule(priceId);
    if (!rule) {
      this.logger.error(
        { userId, priceId, type: CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL },
        'Subscription renewal credits rule missing for price'
      );
      throw new CreditsPlanPolicyMissingError(
        `Subscription renewal credits rule is missing for priceId ${priceId}`
      );
    }
    const refDate = cycleRefDate ?? new Date();
    const periodKey = getPeriodKey(refDate);
    const canAdd = await this.canAddCreditsByType(
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
    await this.addCredits(payload, transaction);
  }

  async addLifetimeMonthlyCredits(
    userId: string,
    priceId: string,
    cycleRefDate: Date,
    transaction?: CreditsTransaction
  ): Promise<void> {
    const rule = this.policy.getLifetimeMonthlyRule(priceId);
    if (!rule) {
      this.logger.error(
        { userId, priceId, type: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY },
        'Lifetime monthly credits rule missing for price'
      );
      throw new CreditsPlanPolicyMissingError(
        `Lifetime monthly credits rule is missing for priceId ${priceId}`
      );
    }
    const refDate = cycleRefDate ?? new Date();
    const periodKey = getPeriodKey(refDate);
    const canAdd = await this.canAddCreditsByType(
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
    await this.addCredits(payload, transaction);
  }

  async getUserCredits(userId: string): Promise<number> {
    try {
      return await this.domainService.getUserCredits(userId);
    } catch (error) {
      this.logger.error(
        { error, userId },
        'getUserCredits failed to resolve balance'
      );
      throw error;
    }
  }

  async updateUserCredits(userId: string, credits: number): Promise<void> {
    try {
      await this.domainService.updateUserCredits(userId, credits);
    } catch (error) {
      this.logger.error({ error, userId }, 'updateUserCredits failed');
      throw error;
    }
  }
}

export const defaultCreditLedgerService = new CreditLedgerService();

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
