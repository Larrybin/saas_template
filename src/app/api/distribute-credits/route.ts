import { NextResponse } from 'next/server';
import { serverEnv } from '@/env/server';
import { ErrorCodes } from '@/lib/server/error-codes';
import { validateInternalJobBasicAuth } from '@/lib/server/internal-auth';
import { createLoggerFromHeaders } from '@/lib/server/logger';
import { runCreditsDistributionJob } from '@/lib/server/usecases/distribute-credits-job';

/**
 * distribute credits to all users daily
 */
export async function GET(request: Request) {
  const log = createLoggerFromHeaders(request.headers, {
    route: '/api/distribute-credits',
    span: 'api.credits.distribute',
  });
  // Validate basic authentication
  const expectedUsername = serverEnv.cronJobs.username;
  const expectedPassword = serverEnv.cronJobs.password;

  const expectedCredentials =
    expectedUsername && expectedPassword
      ? { username: expectedUsername, password: expectedPassword }
      : {};

  if (!validateInternalJobBasicAuth(request, log, expectedCredentials)) {
    log.warn('Unauthorized attempt to distribute credits');
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
        code: ErrorCodes.AuthUnauthorized,
        retryable: false,
      },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Secure Area"',
        },
      }
    );
  }

  log.info('Distribute credits job triggered');
  try {
    const { usersCount, processedCount, errorCount } =
      await runCreditsDistributionJob();
    log.info(
      { usersCount, processedCount, errorCount },
      'Distribute credits completed'
    );
    return NextResponse.json(
      {
        success: true,
        data: {
          usersCount,
          processedCount,
          errorCount,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    log.error({ error }, 'Distribute credits job failed');
    return NextResponse.json(
      {
        success: false,
        error: 'Distribute credits job failed',
        code: ErrorCodes.CreditsDistributionFailed,
        retryable: true,
      },
      { status: 500 }
    );
  }
}
