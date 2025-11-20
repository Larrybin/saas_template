import type { Stripe } from 'stripe';
import type { CreatePortalParams, PortalResult } from '../types';
import {
  createIdempotencyKey,
  mapLocaleToStripeLocale,
} from './utils/stripe-metadata';

type CustomerPortalServiceDeps = {
  stripeClient: Stripe;
};

export class CustomerPortalService {
  private readonly stripe: Stripe;

  constructor(deps: CustomerPortalServiceDeps) {
    this.stripe = deps.stripeClient;
  }

  async createCustomerPortal(
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
}
