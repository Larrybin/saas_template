import { NextResponse } from 'next/server';
import { getCreemFeatureEntitlementsForUser } from '@/lib/server/creem-external-access-provider';
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
        error: 'Missing userId query parameter',
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
      userId,
      localCapabilities,
      creemFeatures,
    });
  } catch (error) {
    logger.error({ userId, error }, 'Failed to reconcile access for user');
    return NextResponse.json(
      {
        error: 'Failed to reconcile access',
      },
      { status: 500 }
    );
  }
}
