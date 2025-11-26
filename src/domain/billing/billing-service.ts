import type { Locale } from 'next-intl';
import type { PlanCreditsConfig } from '@/credits/config';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import {
  type CreditsTransaction,
  resolveExecutor,
} from '@/credits/services/transaction-context';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';
import { UserLifetimeMembershipRepository } from '@/payment/data-access/user-lifetime-membership-repository';
import type {
  CheckoutResult,
  CreateCheckoutParams,
  CreateCreditCheckoutParams,
  PaymentProvider,
  PricePlan,
} from '@/payment/types';
import type { PlanPolicy } from './plan-policy';

export interface StartSubscriptionCheckoutInput
  extends Omit<CreateCheckoutParams, 'planId' | 'priceId' | 'customerEmail'> {
  planId: string;
  priceId: string;
  customerEmail: string;
  locale?: Locale;
  metadata?: Record<string, string>;
}

export type StartCreditCheckoutInput = CreateCreditCheckoutParams;

export interface BillingRenewalInput {
  userId: string;
  priceId: string;
  cycleRefDate?: Date;
  transaction?: CreditsTransaction;
}

export interface GrantLifetimePlanInput {
  userId: string;
  priceId: string;
  cycleRefDate?: Date;
  transaction?: CreditsTransaction;
}

export interface BillingService {
  startSubscriptionCheckout(
    input: StartSubscriptionCheckoutInput
  ): Promise<CheckoutResult>;
  startCreditCheckout(input: StartCreditCheckoutInput): Promise<CheckoutResult>;
  handleRenewal(input: BillingRenewalInput): Promise<void>;
  grantLifetimePlan(input: GrantLifetimePlanInput): Promise<void>;
}

export type BillingServiceDeps = {
  paymentProvider: PaymentProvider;
  creditsGateway: CreditsGateway;
  planPolicy: PlanPolicy;
  creditsEnabled: boolean;
  lifetimeMembershipRepository?: UserLifetimeMembershipRepository;
};

export class DefaultBillingService implements BillingService {
  private readonly logger = getLogger({ span: 'domain.billing.service' });
  private readonly paymentProvider: PaymentProvider;
  private readonly creditsGateway: CreditsGateway;
  private readonly planPolicy: PlanPolicy;
  private readonly creditsEnabled: boolean;
  private readonly lifetimeMembershipRepository: UserLifetimeMembershipRepository;

  constructor(deps: BillingServiceDeps) {
    this.paymentProvider = deps.paymentProvider;
    this.creditsGateway = deps.creditsGateway;
    this.planPolicy = deps.planPolicy;
    this.creditsEnabled = deps.creditsEnabled;
    this.lifetimeMembershipRepository =
      deps.lifetimeMembershipRepository ??
      new UserLifetimeMembershipRepository();
  }

  async startSubscriptionCheckout(
    input: StartSubscriptionCheckoutInput
  ): Promise<CheckoutResult> {
    const plan = this.ensurePlanAndPrice(input.planId, input.priceId);
    this.logger.info(
      { planId: plan.id, priceId: input.priceId },
      'Starting subscription checkout'
    );
    return this.paymentProvider.createCheckout(input);
  }

  async startCreditCheckout(
    input: StartCreditCheckoutInput
  ): Promise<CheckoutResult> {
    this.logger.info(
      { packageId: input.packageId },
      'Starting credit package checkout'
    );
    return this.paymentProvider.createCreditCheckout(input);
  }

  async handleRenewal(input: BillingRenewalInput): Promise<void> {
    if (!this.creditsEnabled) {
      this.logger.debug(
        { priceId: input.priceId },
        'Credits disabled globally, skipping renewal handling'
      );
      return;
    }
    const refDate = input.cycleRefDate ?? new Date();
    const creditsConfig = this.planPolicy.getPlanCreditsConfigByPriceId(
      input.priceId
    );
    if (!this.canGrantSubscriptionCredits(creditsConfig)) {
      this.logger.debug(
        { priceId: input.priceId },
        'Subscription credits not enabled for plan, skipping renewal grant'
      );
      return;
    }
    this.logger.info(
      { userId: input.userId, priceId: input.priceId },
      'Granting subscription renewal credits'
    );
    await this.creditsGateway.addSubscriptionCredits(
      input.userId,
      input.priceId,
      refDate,
      input.transaction
    );
  }

  async grantLifetimePlan(input: GrantLifetimePlanInput): Promise<void> {
    if (!this.creditsEnabled) {
      this.logger.debug(
        { priceId: input.priceId },
        'Credits disabled globally, skipping lifetime grant'
      );
      return;
    }
    const refDate = input.cycleRefDate ?? new Date();
    const creditsConfig = this.planPolicy.getPlanCreditsConfigByPriceId(
      input.priceId
    );
    if (!creditsConfig?.enabled || !creditsConfig.isLifetime) {
      this.logger.debug(
        { priceId: input.priceId },
        'Lifetime credits not enabled for plan, skipping grant'
      );
      return;
    }
    this.logger.info(
      { userId: input.userId, priceId: input.priceId },
      'Granting lifetime monthly credits'
    );
    await this.creditsGateway.addLifetimeMonthlyCredits(
      input.userId,
      input.priceId,
      refDate,
      input.transaction
    );
    const executor = resolveExecutor(input.transaction);
    await this.lifetimeMembershipRepository.upsertMembership(
      {
        userId: input.userId,
        priceId: input.priceId,
        cycleRefDate: refDate,
      },
      executor
    );
  }

  private ensurePlanAndPrice(planId: string, priceId: string): PricePlan {
    const plan = this.planPolicy.getPlanById(planId);
    if (!plan || plan.disabled) {
      throw new DomainError({
        code: ErrorCodes.BillingPlanNotFound,
        message: 'Price plan not found or disabled',
      });
    }
    const price = plan.prices.find(
      (item) => item.priceId === priceId && !item.disabled
    );
    if (!price) {
      throw new DomainError({
        code: ErrorCodes.BillingPriceNotFound,
        message: 'Price not found for plan',
      });
    }
    return plan;
  }

  private canGrantSubscriptionCredits(
    creditsConfig: PlanCreditsConfig | null
  ): boolean {
    if (!creditsConfig) return false;
    if (!creditsConfig.enabled) return false;
    if (creditsConfig.isFree) return false;
    if (creditsConfig.isLifetime) return false;
    if (creditsConfig.disabled) return false;
    return true;
  }
}
