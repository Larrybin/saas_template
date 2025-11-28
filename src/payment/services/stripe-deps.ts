import type Stripe from 'stripe';
import type { PaymentRepository } from '../data-access/payment-repository';
import type { StripeEventRepository } from '../data-access/stripe-event-repository';
import type { UserRepository } from '../data-access/user-repository';

export type StripeClientLike = Pick<
  Stripe,
  'checkout' | 'billingPortal' | 'customers' | 'webhooks'
>;

export type UserRepositoryLike = Pick<
  UserRepository,
  'findUserIdByCustomerId' | 'linkCustomerIdToUser'
>;

export type PaymentRepositoryLike = Pick<
  PaymentRepository,
  | 'listByUser'
  | 'findOneBySubscriptionId'
  | 'findBySessionId'
  | 'insert'
  | 'upsertSubscription'
  | 'updateBySubscriptionId'
  | 'withTransaction'
>;

export type StripeEventRepositoryLike = Pick<
  StripeEventRepository,
  'withEventProcessingLock'
>;

export type StripeCheckoutSessionLike = {
  id: string;
  mode: string;
  customer: string;
  amount_total: number;
  metadata: Record<string, string | undefined>;
};

export type StripeSubscriptionItemLike = {
  current_period_start: number;
  current_period_end: number;
  price: {
    id: string;
    recurring?: {
      interval?: string;
    };
  };
};

export type StripeSubscriptionLike = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  metadata: {
    userId?: string;
    [key: string]: unknown;
  };
  trial_start: number | null | undefined;
  trial_end: number | null | undefined;
  items: {
    data: StripeSubscriptionItemLike[];
  };
};

export type StripeCheckoutCompletedEventLike = {
  id: string;
  type: 'checkout.session.completed';
  created: number;
  data: {
    object: StripeCheckoutSessionLike;
  };
};

export type StripeSubscriptionEventLike = {
  id: string;
  type:
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted';
  created: number;
  data: {
    object: StripeSubscriptionLike;
  };
};

export type StripeWebhookEventLike =
  | StripeCheckoutCompletedEventLike
  | StripeSubscriptionEventLike
  | {
      id: string;
      type: string;
      created: number;
      data: {
        object: unknown;
      };
    };
