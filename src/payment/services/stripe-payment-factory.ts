import Stripe from 'stripe';
import { CreditLedgerService } from '@/credits/services/credit-ledger-service';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import {
  type BillingService,
  DefaultBillingService,
  DefaultPlanPolicy,
} from '@/domain/billing';
import { isCreditsEnabled } from '@/lib/credits-settings';
import { getLogger } from '@/lib/server/logger';
import { PaymentRepository } from '../data-access/payment-repository';
import { StripeEventRepository } from '../data-access/stripe-event-repository';
import { UserRepository } from '../data-access/user-repository';
import type { PaymentProvider } from '../types';
import { DefaultNotificationGateway } from './gateways/default-notification-gateway';
import type { NotificationGateway } from './gateways/notification-gateway';
import type { StripeClientLike } from './stripe-deps';
import { StripePaymentAdapter } from './stripe-payment-adapter';
import { StripeWebhookHandler } from './stripe-webhook-handler';

type StripeProviderOverrides = {
  stripeClient?: StripeClientLike;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  creditsGateway?: CreditsGateway;
  notificationGateway?: NotificationGateway;
  userRepository?: UserRepository;
  paymentRepository?: PaymentRepository;
  stripeEventRepository?: StripeEventRepository;
  billingService?: BillingService;
};

export const createStripeClientFromSecret = (
  secretKey: string
): StripeClientLike => {
  return new Stripe(secretKey);
};

const resolveStripeSecrets = (
  env: { stripeSecretKey?: string | null; stripeWebhookSecret?: string | null },
  overrides?: StripeProviderOverrides
) => {
  const stripeSecretKey =
    overrides?.stripeSecretKey ?? env.stripeSecretKey ?? undefined;
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  }
  const stripeWebhookSecret =
    overrides?.stripeWebhookSecret ?? env.stripeWebhookSecret ?? undefined;
  if (!stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set.');
  }

  return { stripeSecretKey, stripeWebhookSecret };
};

const createStripeInfra = (
  env: { stripeSecretKey?: string | null; stripeWebhookSecret?: string | null },
  overrides?: StripeProviderOverrides
) => {
  const { stripeSecretKey, stripeWebhookSecret } = resolveStripeSecrets(
    env,
    overrides
  );

  const stripeClient =
    overrides?.stripeClient ?? createStripeClientFromSecret(stripeSecretKey);

  const creditsGateway = overrides?.creditsGateway ?? new CreditLedgerService();
  const notificationGateway =
    overrides?.notificationGateway ?? new DefaultNotificationGateway();
  const userRepository = overrides?.userRepository ?? new UserRepository();
  const paymentRepository =
    overrides?.paymentRepository ?? new PaymentRepository();
  const stripeEventRepository =
    overrides?.stripeEventRepository ?? new StripeEventRepository();

  const billingService =
    overrides?.billingService ??
    new DefaultBillingService({
      paymentProvider: undefined as unknown as PaymentProvider,
      creditsGateway,
      planPolicy: new DefaultPlanPolicy(),
      creditsEnabled: isCreditsEnabled(),
    });

  return {
    stripeClient,
    stripeWebhookSecret,
    creditsGateway,
    notificationGateway,
    userRepository,
    paymentRepository,
    stripeEventRepository,
    billingService,
  };
};

export const createStripePaymentProviderFromEnv = (
  env: { stripeSecretKey?: string | null; stripeWebhookSecret?: string | null },
  overrides?: StripeProviderOverrides
): PaymentProvider => {
  const { stripeClient, userRepository, paymentRepository } = createStripeInfra(
    env,
    overrides
  );

  const paymentProvider = new StripePaymentAdapter({
    stripeClient,
    userRepository,
    paymentRepository,
  });

  return paymentProvider;
};

export const createStripeWebhookHandlerFromEnv = (
  env: { stripeSecretKey?: string | null; stripeWebhookSecret?: string | null },
  overrides?: StripeProviderOverrides
): StripeWebhookHandler => {
  const {
    stripeClient,
    stripeWebhookSecret,
    stripeEventRepository,
    paymentRepository,
    creditsGateway,
    notificationGateway,
    billingService,
  } = createStripeInfra(env, overrides);

  const logger = getLogger({
    span: 'payment.stripe',
    provider: 'stripe',
  });

  return new StripeWebhookHandler({
    stripeClient,
    webhookSecret: stripeWebhookSecret,
    stripeEventRepository,
    paymentRepository,
    creditsGateway,
    notificationGateway,
    billingService,
    logger,
  });
};
