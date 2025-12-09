import { describe, expect, it } from 'vitest';
import {
  createWebhookDeps,
  type InMemoryPaymentRepository,
} from '../../../../tests/helpers/payment';
import type {
  StripeSubscriptionEventLike,
  StripeSubscriptionLike,
} from '../stripe-deps';
import { handleStripeWebhookEvent } from '../webhook-handler';

const createSubscription = (
  overrides: Partial<StripeSubscriptionLike> = {}
): StripeSubscriptionLike => {
  const baseStart = Math.floor(Date.now() / 1000);
  const baseEnd = baseStart + 30 * 24 * 60 * 60;

  return {
    id: overrides.id ?? 'sub_test',
    customer: overrides.customer ?? 'cus_test',
    status: overrides.status ?? 'active',
    cancel_at_period_end: overrides.cancel_at_period_end ?? false,
    metadata: {
      userId: 'user-sub',
      ...(overrides.metadata ?? {}),
    },
    trial_start: overrides.trial_start ?? null,
    trial_end: overrides.trial_end ?? null,
    items: overrides.items ?? {
      data: [
        {
          current_period_start: baseStart,
          current_period_end: baseEnd,
          price: {
            id: 'price_monthly',
            recurring: {
              interval: 'month',
            },
          },
        },
      ],
    },
  };
};

const createUpdatedSubscription = (
  subscription: StripeSubscriptionLike
): {
  updated: StripeSubscriptionLike;
  updatedPeriodStart: number;
  updatedPeriodEnd: number;
} => {
  const [firstItem] = subscription.items.data;
  if (!firstItem) {
    throw new Error('Subscription items are required for this test');
  }

  const updatedPeriodStart = firstItem.current_period_start + 31 * 24 * 60 * 60;
  const updatedPeriodEnd = firstItem.current_period_end + 31 * 24 * 60 * 60;

  const updated: StripeSubscriptionLike = {
    ...subscription,
    items: {
      data: [
        {
          ...firstItem,
          current_period_start: updatedPeriodStart,
          current_period_end: updatedPeriodEnd,
        },
      ],
    },
  };

  return {
    updated,
    updatedPeriodStart,
    updatedPeriodEnd,
  };
};

describe('handleStripeWebhookEvent - subscriptions', () => {
  it('persists subscription and grants renewal credits on creation', async () => {
    const deps = createWebhookDeps();
    const subscription = createSubscription();

    const event: StripeSubscriptionEventLike = {
      id: 'evt_sub_created',
      type: 'customer.subscription.created',
      created: 1,
      data: {
        object: subscription,
      },
    };

    await handleStripeWebhookEvent(event, deps);

    const repo = deps.paymentRepository as InMemoryPaymentRepository;
    const stored = await repo.findOneBySubscriptionId(subscription.id);

    expect(stored).toBeDefined();
    expect(stored?.subscriptionId).toBe(subscription.id);
    expect(stored?.userId).toBe('user-sub');
    expect(stored?.priceId).toBe('price_monthly');

    expect(deps.billingService.handleRenewal).toHaveBeenCalledTimes(1);
    expect(deps.billingService.handleRenewal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-sub',
        priceId: 'price_monthly',
        cycleRefDate: expect.any(Date),
      })
    );
  });

  it('grants renewal credits only when period start changes on update', async () => {
    const deps = createWebhookDeps();
    const initial = createSubscription();

    const createdEvent: StripeSubscriptionEventLike = {
      id: 'evt_sub_created',
      type: 'customer.subscription.created',
      created: 1,
      data: {
        object: initial,
      },
    };

    await handleStripeWebhookEvent(createdEvent, deps);

    const { updated, updatedPeriodStart, updatedPeriodEnd } =
      createUpdatedSubscription(initial);

    const updatedEvent: StripeSubscriptionEventLike = {
      id: 'evt_sub_updated',
      type: 'customer.subscription.updated',
      created: 2,
      data: {
        object: updated,
      },
    };

    await handleStripeWebhookEvent(updatedEvent, deps);

    expect(deps.billingService.handleRenewal).toHaveBeenCalledTimes(2);

    const repo = deps.paymentRepository as InMemoryPaymentRepository;
    const stored = await repo.findOneBySubscriptionId(initial.id);
    expect(stored?.periodStart).toEqual(new Date(updatedPeriodStart * 1000));
    expect(stored?.periodEnd).toEqual(new Date(updatedPeriodEnd * 1000));
  });

  it('propagates billingService error when creation renewal handling fails', async () => {
    const deps = createWebhookDeps();
    const subscription = createSubscription();

    const error = new Error('billing failed on creation');
    (deps.billingService.handleRenewal as any).mockRejectedValueOnce(error);

    const event: StripeSubscriptionEventLike = {
      id: 'evt_sub_created_fail',
      type: 'customer.subscription.created',
      created: 1,
      data: {
        object: subscription,
      },
    };

    await expect(handleStripeWebhookEvent(event, deps)).rejects.toThrow(
      'billing failed on creation'
    );

    expect(deps.billingService.handleRenewal).toHaveBeenCalledTimes(1);
    expect(deps.billingService.handleRenewal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-sub',
        priceId: 'price_monthly',
        cycleRefDate: expect.any(Date),
      })
    );
  });

  it('propagates billingService error when update renewal handling fails', async () => {
    const deps = createWebhookDeps();
    const initial = createSubscription();

    const createdEvent: StripeSubscriptionEventLike = {
      id: 'evt_sub_created_ok',
      type: 'customer.subscription.created',
      created: 1,
      data: {
        object: initial,
      },
    };

    await handleStripeWebhookEvent(createdEvent, deps);
    (deps.billingService.handleRenewal as any).mockClear?.();

    const { updated } = createUpdatedSubscription(initial);

    const error = new Error('billing failed on renewal');
    (deps.billingService.handleRenewal as any).mockRejectedValueOnce(error);

    const updatedEvent: StripeSubscriptionEventLike = {
      id: 'evt_sub_updated_fail',
      type: 'customer.subscription.updated',
      created: 2,
      data: {
        object: updated,
      },
    };

    await expect(handleStripeWebhookEvent(updatedEvent, deps)).rejects.toThrow(
      'billing failed on renewal'
    );

    expect(deps.billingService.handleRenewal).toHaveBeenCalledTimes(1);
    expect(deps.billingService.handleRenewal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-sub',
        priceId: 'price_monthly',
        cycleRefDate: expect.any(Date),
      })
    );
  });
});
