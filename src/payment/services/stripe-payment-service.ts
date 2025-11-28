import Stripe from 'stripe';
import { CreditLedgerService } from '@/credits/services/credit-ledger-service';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import {
  type BillingService,
  DefaultBillingService,
  DefaultPlanPolicy,
} from '@/domain/billing';
import { serverEnv } from '@/env/server';
import { isCreditsEnabled } from '@/lib/credits-settings';
import { getLogger } from '@/lib/server/logger';
import { PaymentRepository } from '../data-access/payment-repository';
import { StripeEventRepository } from '../data-access/stripe-event-repository';
import { UserRepository } from '../data-access/user-repository';
import type {
  CheckoutResult,
  CreateCheckoutParams,
  CreateCreditCheckoutParams,
  CreatePortalParams,
  getSubscriptionsParams,
  PaymentProvider,
  PortalResult,
  Subscription,
} from '../types';
import { CustomerPortalService } from './customer-portal-service';
import { DefaultNotificationGateway } from './gateways/default-notification-gateway';
import type { NotificationGateway } from './gateways/notification-gateway';
import { StripeCheckoutService } from './stripe-checkout-service';
import type {
  PaymentRepositoryLike,
  StripeCheckoutSessionLike,
  StripeClientLike,
  StripeEventRepositoryLike,
  StripeSubscriptionLike,
  StripeWebhookEventLike,
  UserRepositoryLike,
} from './stripe-deps';
import { SubscriptionQueryService } from './subscription-query-service';
import { handleStripeWebhookEvent } from './webhook-handler';

type StripePaymentServiceDeps = {
  stripeClient?: StripeClientLike;
  webhookSecret?: string;
  creditsGateway?: CreditsGateway;
  notificationGateway?: NotificationGateway;
  userRepository?: UserRepositoryLike;
  paymentRepository?: PaymentRepositoryLike;
  stripeEventRepository?: StripeEventRepositoryLike;
  billingService?: BillingService;
};

export class StripePaymentService implements PaymentProvider {
  private stripe: StripeClientLike;
  private webhookSecret: string;
  private readonly logger = getLogger({
    span: 'payment.stripe',
    provider: 'stripe',
  });
  private readonly creditsGateway: CreditsGateway;
  private readonly notificationGateway: NotificationGateway;
  private readonly userRepository: UserRepositoryLike;
  private readonly paymentRepository: PaymentRepositoryLike;
  private readonly stripeEventRepository: StripeEventRepositoryLike;
  private readonly checkoutService: StripeCheckoutService;
  private readonly customerPortalService: CustomerPortalService;
  private readonly subscriptionQueryService: SubscriptionQueryService;
  private readonly billingService: BillingService;

  private mapStripeSubscription(
    subscription: Stripe.Subscription
  ): StripeSubscriptionLike {
    return {
      id: subscription.id,
      customer: String(subscription.customer),
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      metadata: { ...(subscription.metadata ?? {}) },
      trial_start: subscription.trial_start ?? null,
      trial_end: subscription.trial_end ?? null,
      items: {
        data:
          subscription.items?.data?.map((item) => ({
            current_period_start: item.current_period_start,
            current_period_end: item.current_period_end,
            price: {
              id: item.price?.id ?? '',
              recurring: {
                interval: item.price?.recurring?.interval,
              },
            },
          })) ?? [],
      },
    };
  }

  private mapStripeCheckoutSession(
    session: Stripe.Checkout.Session
  ): StripeCheckoutSessionLike {
    return {
      id: session.id,
      mode: session.mode ?? 'payment',
      customer: String(session.customer ?? ''),
      amount_total: session.amount_total ?? 0,
      metadata: {
        userId: session.metadata?.userId ?? undefined,
        packageId: session.metadata?.packageId ?? undefined,
        credits: session.metadata?.credits ?? undefined,
        priceId: session.metadata?.priceId ?? undefined,
        type: session.metadata?.type ?? undefined,
      },
    };
  }

  private mapStripeEvent(event: Stripe.Event): StripeWebhookEventLike {
    const base = {
      id: event.id,
      type: event.type,
      created: event.created,
    };

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          ...base,
          type: 'checkout.session.completed',
          data: { object: this.mapStripeCheckoutSession(session) },
        };
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        return {
          ...base,
          type: event.type,
          data: { object: this.mapStripeSubscription(subscription) },
        };
      }
      default:
        return {
          ...base,
          data: { object: event.data.object as unknown },
        };
    }
  }

  constructor(deps: StripePaymentServiceDeps = {}) {
    const webhookSecret = deps.webhookSecret ?? serverEnv.stripeWebhookSecret;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set.');
    }
    if (deps.stripeClient) {
      this.stripe = deps.stripeClient;
    } else {
      const apiKey = serverEnv.stripeSecretKey;
      if (!apiKey) {
        throw new Error('STRIPE_SECRET_KEY environment variable is not set');
      }
      this.stripe = new Stripe(apiKey);
    }
    this.webhookSecret = webhookSecret;
    this.creditsGateway = deps.creditsGateway ?? new CreditLedgerService();
    this.notificationGateway =
      deps.notificationGateway ?? new DefaultNotificationGateway();
    this.userRepository = deps.userRepository ?? new UserRepository();
    this.paymentRepository = deps.paymentRepository ?? new PaymentRepository();
    this.stripeEventRepository =
      deps.stripeEventRepository ?? new StripeEventRepository();
    this.checkoutService = new StripeCheckoutService({
      stripeClient: this.stripe,
      userRepository: this.userRepository,
    });
    this.customerPortalService = new CustomerPortalService({
      stripeClient: this.stripe,
    });
    this.subscriptionQueryService = new SubscriptionQueryService({
      paymentRepository: this.paymentRepository,
    });
    this.billingService =
      deps.billingService ??
      new DefaultBillingService({
        paymentProvider: this,
        creditsGateway: this.creditsGateway,
        planPolicy: new DefaultPlanPolicy(),
        creditsEnabled: isCreditsEnabled(),
      });
  }

  public async createCheckout(
    params: CreateCheckoutParams
  ): Promise<CheckoutResult> {
    return await this.checkoutService.createCheckout(params);
  }

  public async createCreditCheckout(
    params: CreateCreditCheckoutParams
  ): Promise<CheckoutResult> {
    return await this.checkoutService.createCreditCheckout(params);
  }

  public async createCustomerPortal(
    params: CreatePortalParams
  ): Promise<PortalResult> {
    return await this.customerPortalService.createCustomerPortal(params);
  }

  public async getSubscriptions(
    params: getSubscriptionsParams
  ): Promise<Subscription[]> {
    return await this.subscriptionQueryService.getSubscriptions(params);
  }

  public async handleWebhookEvent(
    payload: string,
    signature: string
  ): Promise<void> {
    const log = this.logger.child({ span: 'handleWebhookEvent' });
    const rawEvent = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    );
    const event = this.mapStripeEvent(rawEvent);
    const processing = await this.stripeEventRepository.withEventProcessingLock(
      {
        eventId: event.id,
        type: event.type,
        createdAt: new Date(event.created * 1000),
      },
      async () => {
        await handleStripeWebhookEvent(event, {
          paymentRepository: this.paymentRepository,
          creditsGateway: this.creditsGateway,
          notificationGateway: this.notificationGateway,
          logger: log,
          billingService: this.billingService,
        });
      }
    );
    if (processing.skipped) {
      log.info({ eventId: event.id }, 'Skipping already processed event');
    }
  }
}
