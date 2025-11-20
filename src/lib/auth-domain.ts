import type { Locale } from 'next-intl';
import { getLogger } from '@/lib/logger';
import {
  createDefaultUserLifecycleHooks,
  createUserLifecycleManager,
  type UserLifecycleUserPayload,
} from '@/lib/user-lifecycle';

const userLifecycleManager = createUserLifecycleManager({
  hooks: createDefaultUserLifecycleHooks(),
  logger: getLogger({ span: 'user-lifecycle' }),
});

export type AuthUserCreatedOptions = {
  locale?: Locale;
};

/**
 * Handle post-authentication side effects when a user is created.
 *
 * This function acts as the bridge between Better Auth (or any auth provider)
 * and the user lifecycle event system. Call this after a user has been
 * persisted to trigger cross-cutting behaviours like credits and newsletter.
 */
export async function handleAuthUserCreated(
  user: UserLifecycleUserPayload,
  options: AuthUserCreatedOptions = {}
): Promise<void> {
  await userLifecycleManager.emit({
    type: 'user.created',
    user,
    locale: options.locale,
  });
}
