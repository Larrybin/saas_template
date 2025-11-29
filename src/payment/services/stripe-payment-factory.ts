import Stripe from 'stripe';
import { CreditLedgerService } from '@/credits/services/credit-ledger-service';
import type { CreditsGateway } from '@/credits/services/credits-gateway';
import type { BillingRenewalPort } from '@/domain/billing';
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
  stripeSecretKey?: string | undefined;
  stripeWebhookSecret?: string | undefined;
  creditsGateway?: CreditsGateway;
  notificationGateway?: NotificationGateway;
  userRepository?: UserRepository;
  paymentRepository?: PaymentRepository;
  stripeEventRepository?: StripeEventRepository;
};

type StripeWebhookHandlerOverrides = StripeProviderOverrides & {
  billingService: BillingRenewalPort;
};

export const createStripeClientFromSecret = (
  secretKey: string
): StripeClientLike => {
  return new Stripe(secretKey);
};

type StripeSecretsEnv = {
  stripeSecretKey?: string | undefined;
  stripeWebhookSecret?: string | undefined;
};

const resolveStripeSecretKey = (
  env: StripeSecretsEnv,
  overrides?: StripeProviderOverrides
): string => {
  const stripeSecretKey =
    overrides?.stripeSecretKey ?? env.stripeSecretKey ?? undefined;
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  }
  return stripeSecretKey;
};

const resolveStripeWebhookSecret = (
  env: StripeSecretsEnv,
  overrides?: StripeProviderOverrides
): string => {
  const stripeWebhookSecret =
    overrides?.stripeWebhookSecret ?? env.stripeWebhookSecret ?? undefined;
  if (!stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set.');
  }

  return stripeWebhookSecret;
};

type StripeInfraOptions = {
  requireWebhookSecret?: boolean;
};

type StripeInfraResultBase = {
  stripeClient: StripeClientLike;
  creditsGateway: CreditsGateway;
  notificationGateway: NotificationGateway;
  userRepository: UserRepository;
  paymentRepository: PaymentRepository;
  stripeEventRepository: StripeEventRepository;
};

function createStripeInfra(
  env: StripeSecretsEnv,
  overrides: StripeProviderOverrides | undefined,
  options: StripeInfraOptions & { requireWebhookSecret: true }
): StripeInfraResultBase & { stripeWebhookSecret: string };

function createStripeInfra(
  env: StripeSecretsEnv,
  overrides?: StripeProviderOverrides,
  options?: StripeInfraOptions
): StripeInfraResultBase & { stripeWebhookSecret: string | undefined };

function createStripeInfra(
  env: StripeSecretsEnv,
  overrides?: StripeProviderOverrides,
  options?: StripeInfraOptions
) {
  const stripeSecretKey = resolveStripeSecretKey(env, overrides);

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

  const requireWebhookSecret = options?.requireWebhookSecret ?? true;
  const stripeWebhookSecret = requireWebhookSecret
    ? resolveStripeWebhookSecret(env, overrides)
    : (overrides?.stripeWebhookSecret ?? env.stripeWebhookSecret ?? undefined);

  return {
    stripeClient,
    stripeWebhookSecret,
    creditsGateway,
    notificationGateway,
    userRepository,
    paymentRepository,
    stripeEventRepository,
  };
};

export const createStripePaymentProviderFromEnv = (
  env: StripeSecretsEnv,
  overrides?: StripeProviderOverrides
): PaymentProvider => {
  const { stripeClient, userRepository, paymentRepository } = createStripeInfra(
    env,
    overrides,
    { requireWebhookSecret: false }
  );

  const paymentProvider = new StripePaymentAdapter({
    stripeClient,
    userRepository,
    paymentRepository,
  });

  return paymentProvider;
};

export const createStripeWebhookHandlerFromEnv = (
  env: StripeSecretsEnv,
  overrides: StripeWebhookHandlerOverrides
): StripeWebhookHandler => {
  const {
    stripeClient,
    stripeWebhookSecret,
    stripeEventRepository,
    paymentRepository,
    creditsGateway,
    notificationGateway,
  } = createStripeInfra(env, overrides, { requireWebhookSecret: true });

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
    billingService: overrides.billingService,
    logger,
  });
};
