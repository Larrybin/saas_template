import { NextResponse } from 'next/server';
import { getCreemFeatureEntitlementsForUser } from '@/lib/server/creem-external-access-provider';
import { ErrorCodes } from '@/lib/server/error-codes';
import { getLogger } from '@/lib/server/logger';
import { getUserAccessCapabilities } from '@/lib/server/user-access-capabilities';

const logger = getLogger({ span: 'dev.access-reconciliation' });

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') ?? '';

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        error: 'Missing userId query parameter',
        code: ErrorCodes.UnexpectedError,
        retryable: false,
      },
      { status: 400 }
    );
  }

  try {
    const [localCapabilities, creemFeatures] = await Promise.all([
      getUserAccessCapabilities(userId),
      getCreemFeatureEntitlementsForUser(userId),
    ]);

    logger.info(
      {
        userId,
        localCapabilities,
        creemFeatures,
      },
      'Access reconciliation snapshot for user'
    );

    return NextResponse.json({
      success: true,
      data: {
        userId,
        localCapabilities,
        creemFeatures,
      },
    });
  } catch (error) {
    logger.error({ userId, error }, 'Failed to reconcile access for user');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to reconcile access',
        code: ErrorCodes.UnexpectedError,
        retryable: true,
      },
      { status: 500 }
    );
  }
}
