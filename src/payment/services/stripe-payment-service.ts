import { randomUUID } from 'crypto';
import { Stripe } from 'stripe';
import { websiteConfig } from '@/config/website';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import { CreditLedgerService } from '@/credits/services/credit-ledger-service';
import { getCreditPackageById } from '@/credits/server';
import { CREDIT_TRANSACTION_TYPE } from '@/credits/types';
import { serverEnv } from '@/env/server';
import {
  findPlanByPlanId,
  findPlanByPriceId,
  findPriceInPlan,
} from '@/lib/price-plan';
import { getLogger } from '@/lib/server/logger';
import type { NotificationGateway } from './gateways/notification-gateway';
import { DefaultNotificationGateway } from './gateways/default-notification-gateway';
import { UserRepository } from '../data-access/user-repository';
import { PaymentRepository } from '../data-access/payment-repository';
import { StripeEventRepository } from '../data-access/stripe-event-repository';
import {
  type CheckoutResult,
  type CreateCheckoutParams,
  type CreateCreditCheckoutParams,
  type CreatePortalParams,
  type getSubscriptionsParams,
  type PaymentProvider,
  PaymentTypes,
  type PlanInterval,
  PlanIntervals,
  type PortalResult,
  type Subscription,
  type PaymentStatus,
} from '../types';
import {
  createIdempotencyKey,
  mapLocaleToStripeLocale,
  sanitizeMetadata,
} from './utils/stripe-metadata';
import { handleStripeWebhookEvent } from './webhook-handler';
import { PaymentSecurityError } from './errors';
import { recordPriceMismatchEvent } from './utils/payment-security-monitor';

type StripePaymentServiceDeps = {
  stripeClient?: Stripe;
  webhookSecret?: string;
  creditsGateway?: CreditsGateway;
  notificationGateway?: NotificationGateway;
  userRepository?: UserRepository;
  paymentRepository?: PaymentRepository;
  stripeEventRepository?: StripeEventRepository;
};

export class StripePaymentService implements PaymentProvider {
  private stripe: Stripe;
  private webhookSecret: string;
  private readonly logger = getLogger({
    span: 'payment.stripe',
    provider: 'stripe',
  });
  private readonly creditsGateway: CreditsGateway;
  private readonly notificationGateway: NotificationGateway;
  private readonly userRepository: UserRepository;
  private readonly paymentRepository: PaymentRepository;
  private readonly stripeEventRepository: StripeEventRepository;

  constructor(deps: StripePaymentServiceDeps = {}) {
    const apiKey = deps.stripeClient ? undefined : serverEnv.stripeSecretKey;
    if (!deps.stripeClient && !apiKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    const webhookSecret = deps.webhookSecret ?? serverEnv.stripeWebhookSecret;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set.');
    }
    this.stripe = deps.stripeClient ?? new Stripe(apiKey!);
    this.webhookSecret = webhookSecret;
    this.creditsGateway = deps.creditsGateway ?? new CreditLedgerService();
    this.notificationGateway =
      deps.notificationGateway ?? new DefaultNotificationGateway();
    this.userRepository = deps.userRepository ?? new UserRepository();
    this.paymentRepository = deps.paymentRepository ?? new PaymentRepository();
    this.stripeEventRepository =
      deps.stripeEventRepository ?? new StripeEventRepository();
  }

  private async createOrGetCustomer(email: string, name?: string) {
    const customers = await this.stripe.customers.list({ email, limit: 1 });
    if (customers.data.length > 0) {
      const customerId = customers.data[0].id;
      const userId = await this.userRepository.findUserIdByCustomerId(
        customerId
      );
      if (!userId) {
        await this.userRepository.linkCustomerIdToUser(customerId, email);
      }
      return customerId;
    }
    const customer = await this.stripe.customers.create(
      { email, name },
      {
        idempotencyKey: createIdempotencyKey('stripe.customers.create', {
          email,
        }),
      }
    );
    await this.userRepository.linkCustomerIdToUser(customer.id, email);
    return customer.id;
  }

  public async createCheckout(
    params: CreateCheckoutParams
  ): Promise<CheckoutResult> {
    const {
      planId,
      priceId,
      customerEmail,
      successUrl,
      cancelUrl,
      metadata,
      locale,
    } = params;
    const plan = findPlanByPlanId(planId);
    if (!plan) {
      throw new Error(`Plan with ID ${planId} not found`);
    }
    const price = findPriceInPlan(planId, priceId);
    if (!price) {
      throw new Error(`Price ID ${priceId} not found in plan ${planId}`);
    }
    const customerId = await this.createOrGetCustomer(
      customerEmail,
      metadata?.userName
    );
    const customMetadata = {
      ...sanitizeMetadata(metadata),
      planId,
      priceId,
    };
    const checkoutParams: Stripe.Checkout.SessionCreateParams = {
      line_items: [{ price: priceId, quantity: 1 }],
      mode:
        price.type === PaymentTypes.SUBSCRIPTION ? 'subscription' : 'payment',
      success_url: successUrl ?? '',
      cancel_url: cancelUrl ?? '',
      metadata: customMetadata,
      allow_promotion_codes: price.allowPromotionCode ?? false,
      customer: customerId,
      locale: mapLocaleToStripeLocale(locale),
    };
    if (price.type === PaymentTypes.ONE_TIME) {
      checkoutParams.payment_intent_data = { metadata: customMetadata };
      checkoutParams.invoice_creation = { enabled: true };
    } else {
      checkoutParams.subscription_data = { metadata: customMetadata };
      if (price.trialPeriodDays) {
        checkoutParams.subscription_data.trial_period_days =
          price.trialPeriodDays;
      }
    }
    const session = await this.stripe.checkout.sessions.create(
      checkoutParams,
      {
        idempotencyKey: createIdempotencyKey(
          'stripe.checkout.sessions.create',
          { customerId, planId, priceId, mode: checkoutParams.mode }
        ),
      }
    );
    return { url: session.url ?? '', id: session.id };
  }

  public async createCreditCheckout(
    params: CreateCreditCheckoutParams
  ): Promise<CheckoutResult> {
    const {
      packageId,
      priceId,
      customerEmail,
      successUrl,
      cancelUrl,
      metadata,
      locale,
    } = params;
    const creditPackage = getCreditPackageById(packageId);
    if (!creditPackage) {
      throw new Error(`Credit package with ID ${packageId} not found`);
    }
    const canonicalPriceId = creditPackage.price.priceId;
    if (priceId && priceId !== canonicalPriceId) {
      recordPriceMismatchEvent({
        packageId,
        providedPriceId: priceId,
        expectedPriceId: canonicalPriceId,
        customerEmail,
      });
      throw new PaymentSecurityError('Price mismatch detected for credit package');
    }
    const stripePriceId = canonicalPriceId;
    const customerId = await this.createOrGetCustomer(
      customerEmail,
      metadata?.userName
    );
    const customMetadata = {
      ...sanitizeMetadata(metadata),
      packageId,
      priceId: stripePriceId,
      type: 'credit_purchase',
    };
    const session = await this.stripe.checkout.sessions.create(
      {
        line_items: [{ price: stripePriceId, quantity: 1 }],
        mode: 'payment',
        success_url: successUrl ?? '',
        cancel_url: cancelUrl ?? '',
        metadata: customMetadata,
        customer: customerId,
        locale: mapLocaleToStripeLocale(locale),
      },
      {
        idempotencyKey: createIdempotencyKey(
          'stripe.checkout.credit',
          { customerId, packageId, priceId: stripePriceId }
        ),
      }
    );
    return { url: session.url ?? '', id: session.id };
  }

  public async createCustomerPortal(
    params: CreatePortalParams
  ): Promise<PortalResult> {
    const session = await this.stripe.billingPortal.sessions.create(
      {
        customer: params.customerId,
        return_url: params.returnUrl ?? '',
        locale: mapLocaleToStripeLocale(params.locale),
      },
      {
        idempotencyKey: createIdempotencyKey(
          'stripe.billingPortal.sessions.create',
          { customerId: params.customerId }
        ),
      }
    );
    return { url: session.url ?? '' };
  }

  public async getSubscriptions(
    params: getSubscriptionsParams
  ): Promise<Subscription[]> {
    const records = await this.paymentRepository.listByUser(params.userId);
    return records.map((record) => ({
      id: record.subscriptionId ?? '',
      customerId: record.customerId,
      priceId: record.priceId,
      status: record.status as PaymentStatus,
      type: record.type as PaymentTypes,
      interval: record.interval as PlanInterval,
      currentPeriodStart: record.periodStart ?? undefined,
      currentPeriodEnd: record.periodEnd ?? undefined,
      cancelAtPeriodEnd: record.cancelAtPeriodEnd ?? false,
      trialStartDate: record.trialStart ?? undefined,
      trialEndDate: record.trialEnd ?? undefined,
      createdAt: record.createdAt,
    }));
  }

  public async handleWebhookEvent(
    payload: string,
    signature: string
  ): Promise<void> {
    const log = this.logger.child({ span: 'handleWebhookEvent' });
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    );
    const existing = await this.stripeEventRepository.find(event.id);
    if (existing?.processedAt) {
      log.info({ eventId: event.id }, 'Skipping already processed event');
      return;
    }
    if (!existing) {
      await this.stripeEventRepository.record({
        eventId: event.id,
        type: event.type,
        createdAt: new Date(event.created * 1000),
      });
    }
    await handleStripeWebhookEvent(event, {
      paymentRepository: this.paymentRepository,
      creditsGateway: this.creditsGateway,
      notificationGateway: this.notificationGateway,
      logger: log,
    });
    await this.stripeEventRepository.markProcessed(event.id);
  }
}
