import type Stripe from 'stripe';
import type {
  StripeCheckoutSessionLike,
  StripeSubscriptionLike,
  StripeWebhookEventLike,
} from './stripe-deps';

export const mapStripeSubscription = (
  subscription: Stripe.Subscription
): StripeSubscriptionLike => {
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
            ...(item.price?.recurring?.interval
              ? { recurring: { interval: item.price.recurring.interval } }
              : {}),
          },
        })) ?? [],
    },
  };
};

export const mapStripeCheckoutSession = (
  session: Stripe.Checkout.Session
): StripeCheckoutSessionLike => {
  return {
    id: session.id,
    mode: session.mode ?? null,
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
};

export const mapStripeEvent = (event: Stripe.Event): StripeWebhookEventLike => {
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
        data: { object: mapStripeCheckoutSession(session) },
      };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      return {
        ...base,
        type: event.type,
        data: { object: mapStripeSubscription(subscription) },
      };
    }
    default:
      return {
        ...base,
        data: { object: event.data.object as unknown },
      };
  }
};
