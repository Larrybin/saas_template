import { featureFlags } from '@/config/feature-flags';
import { findPlanByPriceId } from '@/lib/price-plan';
import { getLogger } from '@/lib/server/logger';
import { PlanIntervals, type PricePlan } from '@/payment/types';
import {
  addCredits,
  addCreditsWithExecutor,
  canAddCreditsByType,
} from '../credits';
import type { DbExecutor } from '../data-access/types';
import type { PeriodicAddCreditsPayload } from '../services/credits-gateway';
import { CREDIT_TRANSACTION_TYPE } from '../types';
import type { CommandExecutionResult, CreditCommand } from './credit-command';
import type { PlanUserRecord } from '../domain/lifetime-membership';

export type { PlanUserRecord } from '../domain/lifetime-membership';

export class CreditDistributionService {
  constructor(
    private readonly logger = getLogger({
      span: 'credits.distribution.service',
    })
  ) {}

  async execute(
    commands: CreditCommand[],
    executor?: DbExecutor
  ): Promise<CommandExecutionResult> {
    const result: CommandExecutionResult = {
      total: commands.length,
      processed: 0,
      skipped: 0,
      errors: [],
      flagEnabled: featureFlags.enableCreditPeriodKey,
    };

    const canAdd = async (command: CreditCommand) =>
      canAddCreditsByType(
        command.userId,
        command.type,
        command.periodKey,
        executor
      );

    const add = async (payload: PeriodicAddCreditsPayload) => {
      if (executor) {
        await addCreditsWithExecutor(payload, executor);
        return;
      }
      await addCredits(payload);
    };

    for (const command of commands) {
      try {
        const eligible = await canAdd(command);
        if (!eligible) {
          result.skipped += 1;
          continue;
        }

        const { periodKey } = command;
        if (!periodKey || !Number.isFinite(periodKey)) {
          throw new Error(
            'periodKey is required when executing periodic credit commands'
          );
        }

        const payload: PeriodicAddCreditsPayload = {
          userId: command.userId,
          amount: command.amount,
          type: command.type as PeriodicAddCreditsPayload['type'],
          description: command.description,
          periodKey,
          ...(command.expireDays !== undefined
            ? { expireDays: command.expireDays }
            : {}),
          ...(command.paymentId !== undefined
            ? { paymentId: command.paymentId }
            : {}),
        };
        await add(payload);
        result.processed += 1;
      } catch (error) {
        result.errors.push({
          userId: command.userId,
          type: command.type,
          error,
        });
        this.logger.error(
          { error, userId: command.userId, type: command.type },
          'Failed to execute credit command'
        );
      }
    }

    return result;
  }

  generateFreeCommands(options: {
    userIds: string[];
    plan?: PricePlan;
    periodKey?: number;
    monthLabel: string;
  }): CreditCommand[] {
    const { userIds, plan, periodKey, monthLabel } = options;
    if (!periodKey || !Number.isFinite(periodKey)) {
      throw new Error(
        'periodKey is required when generating free plan commands'
      );
    }
    if (!plan?.credits?.enable) {
      return [];
    }
    const credits = plan.credits.amount ?? 0;
    if (credits <= 0) {
      return [];
    }
    return userIds.map((userId) => ({
      userId,
      type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
      amount: credits,
      description: `Free monthly credits: ${credits} for ${monthLabel}`,
      ...(plan.credits?.expireDays !== undefined
        ? { expireDays: plan.credits.expireDays }
        : {}),
      periodKey,
    }));
  }

  generateLifetimeCommands(options: {
    users: PlanUserRecord[];
    periodKey?: number;
    monthLabel: string;
  }): CreditCommand[] {
    if (!options.periodKey || !Number.isFinite(options.periodKey)) {
      throw new Error(
        'periodKey is required when generating lifetime commands'
      );
    }
    return this.generatePlanCommands({
      ...options,
      creditType: CREDIT_TRANSACTION_TYPE.LIFETIME_MONTHLY,
      descriptionPrefix: 'Lifetime monthly credits',
      planFilter: (plan) => Boolean(plan?.isLifetime && plan.credits?.enable),
    });
  }

  generateYearlyCommands(options: {
    users: PlanUserRecord[];
    periodKey?: number;
    monthLabel: string;
  }): CreditCommand[] {
    if (!options.periodKey || !Number.isFinite(options.periodKey)) {
      throw new Error('periodKey is required when generating yearly commands');
    }
    return this.generatePlanCommands({
      ...options,
      creditType: CREDIT_TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      descriptionPrefix: 'Yearly subscription monthly credits',
      planFilter: (plan, priceId) => {
        if (!plan?.credits?.enable) return false;
        return plan.prices.some(
          (price) =>
            price.priceId === priceId && price.interval === PlanIntervals.YEAR
        );
      },
    });
  }

  private generatePlanCommands(options: {
    users: PlanUserRecord[];
    periodKey?: number;
    monthLabel: string;
    creditType: string;
    descriptionPrefix: string;
    planFilter?: (plan: PricePlan | undefined, priceId: string) => boolean;
  }): CreditCommand[] {
    const {
      users,
      periodKey,
      monthLabel,
      creditType,
      descriptionPrefix,
      planFilter,
    } = options;

    const commands: CreditCommand[] = [];
    for (const { userId, priceId } of users) {
      const plan = findPlanByPriceId(priceId);
      if (!plan?.credits?.enable) {
        continue;
      }
      if (planFilter && !planFilter(plan, priceId)) {
        continue;
      }
      const credits = plan.credits.amount ?? 0;
      if (credits <= 0) {
        continue;
      }
      commands.push({
        userId,
        type: creditType,
        amount: credits,
        description: `${descriptionPrefix}: ${credits} for ${monthLabel}`,
        ...(plan.credits.expireDays !== undefined
          ? { expireDays: plan.credits.expireDays }
          : {}),
        ...(periodKey !== undefined ? { periodKey } : {}),
      });
    }
    return commands;
  }
}
