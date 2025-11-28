import { getCreditPackageById } from '@/credits/server';
import { findPlanByPlanId, findPriceInPlan } from '@/lib/price-plan';
import type {
  CheckoutResult,
  CreateCheckoutParams,
  CreateCreditCheckoutParams,
} from '../types';
import { PaymentTypes } from '../types';
import { PaymentSecurityError } from './errors';
import type { StripeClientLike, UserRepositoryLike } from './stripe-deps';
import { recordPriceMismatchEvent } from './utils/payment-security-monitor';
import {
  createIdempotencyKey,
  mapLocaleToStripeLocale,
  sanitizeMetadata,
} from './utils/stripe-metadata';

type StripeCheckoutServiceDeps = {
  stripeClient: StripeClientLike;
  userRepository: UserRepositoryLike;
};

export class StripeCheckoutService {
  private readonly stripe: StripeClientLike;
  private readonly userRepository: UserRepositoryLike;

  constructor(deps: StripeCheckoutServiceDeps) {
    this.stripe = deps.stripeClient;
    this.userRepository = deps.userRepository;
  }

  private async createOrGetCustomer(email: string, name?: string) {
    const customers = await this.stripe.customers.list({ email, limit: 1 });
    const firstCustomer = customers.data[0];
    if (firstCustomer) {
      const customerId = firstCustomer.id;
      const userId =
        await this.userRepository.findUserIdByCustomerId(customerId);
      if (!userId) {
        await this.userRepository.linkCustomerIdToUser(customerId, email);
      }
      return customerId;
    }
    const customerParams: Stripe.CustomerCreateParams = {
      email,
      ...(name ? { name } : {}),
    };
    const customer = await this.stripe.customers.create(customerParams, {
      idempotencyKey: createIdempotencyKey('stripe.customers.create', {
        email,
      }),
    });
    await this.userRepository.linkCustomerIdToUser(customer.id, email);
    return customer.id;
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
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
    const session = await this.stripe.checkout.sessions.create(checkoutParams, {
      idempotencyKey: createIdempotencyKey('stripe.checkout.sessions.create', {
        customerId,
        planId,
        priceId,
        mode: checkoutParams.mode,
      }),
    });
    return { url: session.url ?? '', id: session.id };
  }

  async createCreditCheckout(
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
      throw new PaymentSecurityError(
        'Price mismatch detected for credit package'
      );
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
        idempotencyKey: createIdempotencyKey('stripe.checkout.credit', {
          customerId,
          packageId,
          priceId: stripePriceId,
        }),
      }
    );
    return { url: session.url ?? '', id: session.id };
  }
}
