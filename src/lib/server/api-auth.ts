import 'server-only';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { UnauthorizedError } from '@/lib/auth-errors';
import type { User } from '@/lib/auth-types';
import {
  AUTH_BANNED_FALLBACK_MESSAGE,
  getDomainErrorMessage,
} from '@/lib/domain-error-utils';
import { getLogger } from '@/lib/server/logger';

type ApiAuthResult =
  | {
      ok: true;
      user: User;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function buildUnauthorizedResponse() {
  return NextResponse.json(
    {
      success: false,
      error: 'Unauthorized',
      code: 'AUTH_UNAUTHORIZED',
      retryable: false,
    },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer',
      },
    }
  );
}

function buildBannedResponse() {
  return NextResponse.json(
    {
      success: false,
      error: getDomainErrorMessage(
        'AUTH_BANNED',
        undefined,
        AUTH_BANNED_FALLBACK_MESSAGE
      ),
      code: 'AUTH_BANNED',
      retryable: false,
    },
    {
      status: 403,
    }
  );
}

/**
 * Ensures the incoming API request has an authenticated Better Auth session.
 * Returns the resolved user when successful or a standardized 401 response on failure.
 */
export async function ensureApiUser(request: Request): Promise<ApiAuthResult> {
  const logger = getLogger({ span: 'infra.api-auth' });
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (session?.user) {
      const normalizedUser: User = {
        ...(session.user as User),
        role: (session.user as User).role ?? 'user',
        banned: (session.user as User).banned ?? false,
      };

      if (normalizedUser.banned) {
        logger.warn(
          { userId: normalizedUser.id },
          'Blocked banned user in ensureApiUser'
        );

        return {
          ok: false,
          response: buildBannedResponse(),
        };
      }

      return {
        ok: true,
        user: normalizedUser,
      };
    }
  } catch (error) {
    const authError = new UnauthorizedError(
      'Failed to authenticate API request'
    );
    logger.error(
      { error, code: authError.code },
      'Failed to authenticate API request'
    );
  }

  return {
    ok: false,
    response: buildUnauthorizedResponse(),
  };
}
