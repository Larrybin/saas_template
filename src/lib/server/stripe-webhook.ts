import { serverEnv } from '@/env/server';
import { getBillingService } from '@/lib/server/billing-service';
import { createStripeWebhookHandlerFromEnv } from '@/payment/services/stripe-payment-factory';

export const handleStripeWebhook = async (
  payload: string,
  signature: string
): Promise<void> => {
  const billingService = getBillingService();

  const handler = createStripeWebhookHandlerFromEnv(
    {
      stripeSecretKey: serverEnv.stripeSecretKey,
      stripeWebhookSecret: serverEnv.stripeWebhookSecret,
    },
    {
      billingService,
    }
  );

  await handler.handleWebhookEvent(payload, signature);
};
