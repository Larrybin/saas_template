import { Stripe } from 'stripe';
import { CreditLedgerService } from '@/credits/services/credit-ledger-service';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import { serverEnv } from '@/env/server';
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
import { SubscriptionQueryService } from './subscription-query-service';
import { handleStripeWebhookEvent } from './webhook-handler';

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
  private readonly checkoutService: StripeCheckoutService;
  private readonly customerPortalService: CustomerPortalService;
  private readonly subscriptionQueryService: SubscriptionQueryService;

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
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    );
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
        });
      }
    );
    if (processing.skipped) {
      log.info({ eventId: event.id }, 'Skipping already processed event');
    }
  }
}
