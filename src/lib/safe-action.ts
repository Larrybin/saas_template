import { createSafeActionClient } from 'next-safe-action';
import type { User } from './auth-types';
import { isDemoWebsite } from './demo';
import { DomainError } from './domain-errors';
import { getSession } from './server';
import { getLogger, withLogContext } from './server/logger';

// -----------------------------------------------------------------------------
// 1. Base action client – put global error handling / metadata here if needed
// -----------------------------------------------------------------------------
export const actionClient = createSafeActionClient({
  handleServerError: (e) => {
    const logger = getLogger({ span: 'safe-action' });
    if (e instanceof DomainError) {
      logger.error('Domain error in safe-action', {
        code: e.code,
        retryable: e.retryable,
        error: e,
      });
      return {
        success: false,
        error: e.message,
        code: e.code,
        retryable: e.retryable,
      };
    }

    if (e instanceof Error) {
      logger.error('Unhandled error in safe-action', { error: e });
      return {
        success: false,
        error: e.message,
      };
    }

    return {
      success: false,
      error: 'Something went wrong while executing the action',
    };
  },
});

// -----------------------------------------------------------------------------
// 2. Auth-guarded client
// -----------------------------------------------------------------------------
export const userActionClient = actionClient.use(async ({ next }) => {
  const session = await getSession();
  if (!session?.user) {
    return {
      success: false,
      error: 'Unauthorized',
      code: 'AUTH_UNAUTHORIZED',
      retryable: false,
    };
  }

  const user = session.user;

  return await withLogContext({ userId: user.id }, () =>
    next({ ctx: { user } })
  );
});

// -----------------------------------------------------------------------------
// 3. Admin-only client (extends auth client)
// -----------------------------------------------------------------------------
export const adminActionClient = userActionClient.use(async ({ next, ctx }) => {
  const user = (ctx as { user: User }).user;
  const isDemo = isDemoWebsite();
  const isAdmin = user.role === 'admin';

  // If this is a demo website and user is not an admin, allow the request
  if (!isAdmin && !isDemo) {
    return {
      success: false,
      error: 'Unauthorized',
      code: 'AUTH_UNAUTHORIZED',
      retryable: false,
    };
  }

  return next({ ctx });
});
