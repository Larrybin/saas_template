import { CreditLedgerService } from '@/credits/services/credit-ledger-service';
import { serverEnv } from '@/env/server';
import { DomainError } from '@/lib/domain-errors';
import { createBillingService } from '@/lib/server/billing-service';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';
import { verifyCreemWebhookSignature } from '@/payment/creem-signature';
import type { CreemWebhookEvent } from '@/payment/creem-types';
import { CreemEventRepository } from '@/payment/data-access/creem-event-repository';
import { PaymentRepository } from '@/payment/data-access/payment-repository';
import { CreemWebhookHandler } from '@/payment/services/creem-webhook-handler';
import type { PaymentProvider } from '@/payment/types';

const CREEM_SIGNATURE_HEADER = 'creem-signature';

const createWebhookPaymentProvider = (): PaymentProvider => ({
  async createCheckout() {
    throw new Error('Webhook PaymentProvider should not be used for checkout');
  },
  async createCreditCheckout() {
    throw new Error('Webhook PaymentProvider should not be used for checkout');
  },
  async createCustomerPortal() {
    throw new Error('Webhook PaymentProvider should not be used for portal');
  },
  async getSubscriptions() {
    return [];
  },
});

export const handleCreemWebhook = async (
  payload: string,
  headers: Headers
): Promise<void> => {
  const logger = getLogger({
    span: 'api.webhooks.creem',
    provider: 'creem',
  });

  const apiKey = serverEnv.creemApiKey;
  const secret = serverEnv.creemWebhookSecret;

  const signature = headers.get(CREEM_SIGNATURE_HEADER);

  if (!payload) {
    logger.warn({ reason: 'missing-payload' }, 'Missing Creem webhook payload');
    throw new DomainError({
      code: ErrorCodes.PaymentSecurityViolation,
      message: 'Missing Creem webhook payload',
      retryable: false,
    });
  }

  const missingEnv: string[] = [];
  if (!apiKey) {
    missingEnv.push('CREEM_API_KEY');
  }
  if (!secret) {
    missingEnv.push('CREEM_WEBHOOK_SECRET');
  }

  if (missingEnv.length > 0) {
    logger.error(
      { missingEnv },
      'Creem webhook misconfigured: missing environment variables'
    );
    throw new DomainError({
      code: ErrorCodes.CreemWebhookMisconfigured,
      message: `Missing Creem configuration: ${missingEnv.join(', ')}`,
      retryable: false,
    });
  }

  if (!signature) {
    logger.warn(
      { reason: 'missing-signature', signatureHeader: CREEM_SIGNATURE_HEADER },
      'Missing Creem webhook signature'
    );
    throw new DomainError({
      code: ErrorCodes.PaymentSecurityViolation,
      message: 'Missing Creem webhook signature',
      retryable: false,
    });
  }

  const isValid = verifyCreemWebhookSignature(payload, signature, secret);

  if (!isValid) {
    logger.warn(
      {
        reason: 'invalid-signature',
        signatureHeader: CREEM_SIGNATURE_HEADER,
      },
      'Creem webhook signature verification failed'
    );

    throw new DomainError({
      code: ErrorCodes.PaymentSecurityViolation,
      message: 'Invalid Creem webhook signature',
      retryable: false,
    });
  }

  let event: CreemWebhookEvent;

  try {
    event = JSON.parse(payload) as CreemWebhookEvent;
  } catch (error) {
    logger.error({ error }, 'Failed to parse Creem webhook payload');
    throw new DomainError({
      code: ErrorCodes.UnexpectedError,
      message: 'Invalid Creem webhook payload',
      retryable: false,
    });
  }

  logger.info(
    {
      eventId: event.id,
      eventType: event.eventType,
      mode: event.mode,
    },
    'Received Creem webhook event'
  );

  const paymentRepository = new PaymentRepository();
  const eventRepository = new CreemEventRepository();
  const creditsGateway = new CreditLedgerService();
  const billingService = createBillingService({
    paymentProvider: createWebhookPaymentProvider(),
    creditsGateway,
  });
  const eventVerifier = {
    verify(event: CreemWebhookEvent, rawPayload: string, eventLogger = logger) {
      if (!event.id || !event.eventType) {
        eventLogger.error(
          {
            hasEventId: Boolean(event.id),
            hasEventType: Boolean(event.eventType),
            payloadSize: rawPayload.length,
          },
          'Invalid Creem webhook event payload'
        );

        throw new DomainError({
          code: ErrorCodes.UnexpectedError,
          message: 'Invalid Creem webhook event payload',
          retryable: false,
        });
      }
    },
  };

  const handler = new CreemWebhookHandler({
    paymentRepository,
    eventRepository,
    billingService,
    creditsGateway,
    logger,
    eventVerifier,
  });

  await handler.handleWebhookEvent(event, payload);
};
