import { type NextRequest, NextResponse } from 'next/server';
import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';
import { createLoggerFromHeaders } from '@/lib/server/logger';
import { handleWebhookEvent } from '@/payment';

/**
 * Stripe webhook handler
 * This endpoint receives webhook events from Stripe and processes them
 *
 * @param req The incoming request
 * @returns NextResponse
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLoggerFromHeaders(req.headers, {
    span: 'api.webhooks.stripe',
    route: '/api/webhooks/stripe',
    provider: 'stripe',
  });

  // Get the request body as text
  const payload = await req.text();

  // Get the Stripe signature from headers
  const signature = req.headers.get('stripe-signature') || '';

  try {
    // Validate inputs
    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing webhook payload',
          code: ErrorCodes.UnexpectedError,
          retryable: false,
        },
        { status: 400 }
      );
    }

    if (!signature) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing Stripe signature',
          code: ErrorCodes.UnexpectedError,
          retryable: false,
        },
        { status: 400 }
      );
    }

    // Process the webhook event
    await handleWebhookEvent(payload, signature);

    // Return success
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    if (error instanceof DomainError) {
      logger.error(
        { error, code: error.code, retryable: error.retryable },
        'Stripe webhook domain error'
      );

      const status =
        error.code === ErrorCodes.PaymentSecurityViolation
          ? 400
          : error.retryable
            ? 500
            : 400;

      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          retryable: error.retryable,
        },
        { status }
      );
    }

    logger.error({ error }, 'Stripe webhook unexpected error');

    // Return generic error
    return NextResponse.json(
      {
        success: false,
        error: 'Webhook handler failed',
        code: ErrorCodes.UnexpectedError,
        retryable: true,
      },
      { status: 400 }
    );
  }
}
