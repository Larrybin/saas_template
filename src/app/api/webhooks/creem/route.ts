import { type NextRequest, NextResponse } from 'next/server';
import { DomainError } from '@/lib/domain-errors';
import { handleCreemWebhook } from '@/lib/server/creem-webhook';
import { ErrorCodes } from '@/lib/server/error-codes';
import { createLoggerFromHeaders } from '@/lib/server/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLoggerFromHeaders(req.headers, {
    span: 'api.webhooks.creem',
    route: '/api/webhooks/creem',
    provider: 'creem',
  });

  const payload = await req.text();

  try {
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

    await handleCreemWebhook(payload, req.headers);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    if (error instanceof DomainError) {
      logger.error(
        { error, code: error.code, retryable: error.retryable },
        'Creem webhook domain error'
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

    logger.error({ error }, 'Creem webhook unexpected error');

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
