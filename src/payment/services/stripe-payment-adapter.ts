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
import { StripeCheckoutService } from './stripe-checkout-service';
import type {
  PaymentRepositoryLike,
  StripeClientLike,
  UserRepositoryLike,
} from './stripe-deps';
import { SubscriptionQueryService } from './subscription-query-service';

type StripePaymentAdapterDeps = {
  stripeClient: StripeClientLike;
  userRepository: UserRepositoryLike;
  paymentRepository: PaymentRepositoryLike;
};

export class StripePaymentAdapter implements PaymentProvider {
  private stripe: StripeClientLike;
  private readonly userRepository: UserRepositoryLike;
  private readonly paymentRepository: PaymentRepositoryLike;
  private readonly checkoutService: StripeCheckoutService;
  private readonly customerPortalService: CustomerPortalService;
  private readonly subscriptionQueryService: SubscriptionQueryService;

  constructor(deps: StripePaymentAdapterDeps) {
    if (!deps.stripeClient) {
      throw new Error('Stripe client is required');
    }
    this.stripe = deps.stripeClient;
    this.userRepository = deps.userRepository;
    this.paymentRepository = deps.paymentRepository;
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
}
