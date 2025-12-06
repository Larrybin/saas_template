import { PaymentRepository } from '../data-access/payment-repository';
import type { PaymentProvider } from '../types';
import { type CreemClient, createCreemClientFromEnv } from './creem-client';
import { CreemPaymentProvider } from './creem-payment-adapter';
import type { PaymentRepositoryLike } from './stripe-deps';
import { SubscriptionQueryService } from './subscription-query-service';

export type CreemProviderOverrides = {
  creemClient?: CreemClient;
  paymentRepository?: PaymentRepositoryLike;
};

export const createCreemPaymentProviderFromEnv = (
  overrides?: CreemProviderOverrides
): PaymentProvider => {
  const creemClient = overrides?.creemClient ?? createCreemClientFromEnv();
  const paymentRepository =
    overrides?.paymentRepository ?? new PaymentRepository();
  const subscriptionQueryService = new SubscriptionQueryService({
    paymentRepository,
  });

  return new CreemPaymentProvider({
    creemClient,
    subscriptionQueryService,
  });
};
