import type Stripe from 'stripe';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import type { BillingRenewalPort } from '@/domain/billing';
import type { Logger } from '@/lib/server/logger';
import type { NotificationGateway } from './gateways/notification-gateway';
import type {
  PaymentRepositoryLike,
  StripeClientLike,
  StripeEventRepositoryLike,
} from './stripe-deps';
import { mapStripeEvent } from './stripe-event-mapper';
import { handleStripeWebhookEvent } from './webhook-handler';

export type StripeWebhookHandlerDeps = {
  stripeClient: StripeClientLike;
  webhookSecret: string;
  stripeEventRepository: StripeEventRepositoryLike;
  paymentRepository: PaymentRepositoryLike;
  creditsGateway: CreditsGateway;
  notificationGateway: NotificationGateway;
  billingService: BillingRenewalPort;
  logger: Logger;
};

export class StripeWebhookHandler {
  private readonly stripe: StripeClientLike;
  private readonly webhookSecret: string;
  private readonly stripeEventRepository: StripeEventRepositoryLike;
  private readonly paymentRepository: PaymentRepositoryLike;
  private readonly creditsGateway: CreditsGateway;
  private readonly notificationGateway: StripeWebhookHandlerDeps['notificationGateway'];
  private readonly billingService: BillingRenewalPort;
  private readonly logger: Logger;

  constructor(deps: StripeWebhookHandlerDeps) {
    this.stripe = deps.stripeClient;
    this.webhookSecret = deps.webhookSecret;
    this.stripeEventRepository = deps.stripeEventRepository;
    this.paymentRepository = deps.paymentRepository;
    this.creditsGateway = deps.creditsGateway;
    this.notificationGateway = deps.notificationGateway;
    this.billingService = deps.billingService;
    this.logger = deps.logger;
  }

  async handleWebhookEvent(payload: string, signature: string): Promise<void> {
    const log = this.logger.child({ span: 'handleWebhookEvent' });

    const rawEvent = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    ) as Stripe.Event;

    const event = mapStripeEvent(rawEvent);

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
