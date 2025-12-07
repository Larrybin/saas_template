import type { Locale } from 'next-intl';
import { getLogger } from '@/lib/logger';
import { findPlanByPriceId } from '@/lib/price-plan';
import { getMembershipService } from '@/lib/server/membership-service';
import {
  createDefaultUserLifecycleHooks,
  createUserLifecycleManager,
  type UserLifecycleUserPayload,
} from '@/lib/user-lifecycle';
import { getSubscriptions } from '@/payment';
import { PaymentTypes } from '@/payment/types';

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
    ...(options.locale ? { locale: options.locale } : {}),
  });
}

export type AccessCapability = `plan:${string}` | `feature:${string}`;

export const PLAN_ACCESS_CAPABILITIES = {
  pro: 'plan:pro' as AccessCapability,
  lifetime: 'plan:lifetime' as AccessCapability,
} as const;

export const buildFeatureAccessCapability = (key: string): AccessCapability =>
  `feature:${key}`;

const accessLogger = getLogger({ span: 'auth-domain.access' });

export interface ExternalAccessProvider {
  hasAccess(userId: string, capability: AccessCapability): Promise<boolean>;
}

const nullExternalAccessProvider: ExternalAccessProvider = {
  async hasAccess() {
    return false;
  },
};

let externalAccessProvider: ExternalAccessProvider = nullExternalAccessProvider;

export const setExternalAccessProvider = (
  provider: ExternalAccessProvider
): void => {
  externalAccessProvider = provider ?? nullExternalAccessProvider;
};

export const getExternalAccessProvider = (): ExternalAccessProvider => {
  return externalAccessProvider;
};

export type GetUserAccessCapabilitiesOptions = {
  /**
   * Optional external capabilities to resolve via ExternalAccessProvider.
   * Capabilities with hasAccess=true will be merged into the returned set.
   */
  externalCapabilities?: AccessCapability[];
};

const hasActiveSubscriptionStatus = (status: string | undefined): boolean => {
  if (!status) return false;
  return status === 'active' || status === 'trialing';
};

export async function getUserAccessCapabilities(
  userId: string,
  options: GetUserAccessCapabilitiesOptions = {}
): Promise<AccessCapability[]> {
  if (!userId) {
    return [];
  }
  const logger = accessLogger.child({ userId });
  const capabilities = new Set<AccessCapability>();
  const { externalCapabilities } = options;

  try {
    const [subscriptions, memberships] = await Promise.all([
      getSubscriptions({ userId }),
      getMembershipService().findActiveMembershipsByUserIds([userId]),
    ]);

    for (const subscription of subscriptions) {
      if (
        subscription.type === PaymentTypes.SUBSCRIPTION &&
        hasActiveSubscriptionStatus(subscription.status)
      ) {
        const plan = findPlanByPriceId(subscription.priceId);
        if (!plan) {
          logger.debug(
            { priceId: subscription.priceId },
            'Active subscription without matching plan; skipping capability mapping'
          );
          continue;
        }
        if (plan.disabled || plan.isFree) {
          continue;
        }
        capabilities.add(`plan:${plan.id}`);
      }
    }

    for (const membership of memberships) {
      const plan = findPlanByPriceId(membership.priceId);
      if (!plan) {
        logger.debug(
          { priceId: membership.priceId },
          'Lifetime membership without matching plan; skipping capability mapping'
        );
        continue;
      }
      capabilities.add(`plan:${plan.id}`);
    }

    if (externalCapabilities && externalCapabilities.length > 0) {
      const provider = getExternalAccessProvider();

      const resolvedExternalCapabilities = await Promise.all(
        externalCapabilities.map(async (capability) => {
          try {
            const hasAccess = await provider.hasAccess(userId, capability);
            return hasAccess ? capability : null;
          } catch (error) {
            logger.warn(
              { error, capability },
              'External access provider failed; skipping capability mapping'
            );
            return null;
          }
        })
      );

      for (const capability of resolvedExternalCapabilities) {
        if (capability) {
          capabilities.add(capability);
        }
      }
    }

    return Array.from(capabilities);
  } catch (error) {
    logger.error(
      { error },
      'Failed to resolve user access capabilities; falling back to empty capabilities'
    );
    return [];
  }
}
