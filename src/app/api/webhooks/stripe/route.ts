import { type NextRequest, NextResponse } from 'next/server';
import { DomainError } from '@/lib/domain-errors';
import { handleWebhookEvent } from '@/payment';

/**
 * Stripe webhook handler
 * This endpoint receives webhook events from Stripe and processes them
 *
 * @param req The incoming request
 * @returns NextResponse
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Get the request body as text
  const payload = await req.text();

  // Get the Stripe signature from headers
  const signature = req.headers.get('stripe-signature') || '';

  try {
    // Validate inputs
    if (!payload) {
      return NextResponse.json(
        { error: 'Missing webhook payload' },
        { status: 400 }
      );
    }

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing Stripe signature' },
        { status: 400 }
      );
    }

    // Process the webhook event
    await handleWebhookEvent(payload, signature);

    // Return success
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Error in webhook route:', error);

    if (error instanceof DomainError) {
      const status =
        error.code === 'PAYMENT_SECURITY_VIOLATION'
          ? 400
          : error.retryable
            ? 500
            : 400;

      return NextResponse.json(
        { error: error.message, code: error.code, retryable: error.retryable },
        { status }
      );
    }

    // Return generic error
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}
