import { distributeCreditsToAllUsers } from '@/credits/distribute';
import { NextResponse } from 'next/server';

// Basic authentication middleware
function validateBasicAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  // Extract credentials from Authorization header
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString(
    'utf-8'
  );
  const [username, password] = credentials.split(':');

  // Validate against environment variables
  const expectedUsername = process.env.CRON_JOBS_USERNAME;
  const expectedPassword = process.env.CRON_JOBS_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    console.error(
      'Basic auth credentials not configured in environment variables'
    );
    return false;
  }

  return username === expectedUsername && password === expectedPassword;
}

/**
 * distribute credits to all users daily
 */
export async function GET(request: Request) {
  // Validate basic authentication
  if (!validateBasicAuth(request)) {
    console.error('distribute credits unauthorized');
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"',
      },
    });
  }

  console.log('route: distribute credits start');
  const { usersCount, processedCount, errorCount } =
    await distributeCreditsToAllUsers();
  console.log(
    `route: distribute credits end, users: ${usersCount}, processed: ${processedCount}, errors: ${errorCount}`
  );
  return NextResponse.json({
    message: `distribute credits success, users: ${usersCount}, processed: ${processedCount}, errors: ${errorCount}`,
    usersCount,
    processedCount,
    errorCount,
  });
}
