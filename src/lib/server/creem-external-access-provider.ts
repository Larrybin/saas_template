import { checkSubscriptionAccess } from '@creem_io/better-auth/server';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '@/db/index';
import { serverEnv } from '@/env/server';
import type {
  AccessCapability,
  ExternalAccessProvider,
} from '@/lib/auth-domain';
import { getLogger } from '@/lib/server/logger';
import { isCreemBetterAuthEnabled } from './creem-config';

const logger = getLogger({
  span: 'auth-domain.external-access.creem',
});

let creemDatabaseAdapter: ReturnType<typeof drizzleAdapter> | undefined;

const getCreemDatabaseAdapter = async () => {
  if (!creemDatabaseAdapter) {
    creemDatabaseAdapter = drizzleAdapter(await getDb(), {
      provider: 'pg',
    });
  }

  return creemDatabaseAdapter;
};

/**
 * 通过 Better Auth Creem 插件在 Database Mode 下提供的本地视图
 * 解析 feature 级访问能力。
 *
 * 设计约束：
 * - 仅在 `CREEM_BETTER_AUTH_ENABLED=true` 且配置了 Creem API Key 时生效；
 * - 只暴露 feature 级能力快照，不写入或修改 Billing/Credits/Membership；
 * - 任意错误视为“无额外能力”，由外层兜底为 false。
 */
export async function getCreemFeatureEntitlementsForUser(
  userId: string
): Promise<string[]> {
  if (!userId) {
    return [];
  }

  if (!isCreemBetterAuthEnabled) {
    logger.debug(
      { userId },
      'Creem Better Auth integration disabled; skipping external entitlements'
    );
    return [];
  }

  if (!serverEnv.creemApiKey) {
    logger.debug(
      { userId },
      'Creem API key not configured; skipping external entitlements'
    );
    return [];
  }

  const database = await getCreemDatabaseAdapter();

  const status = await checkSubscriptionAccess(
    {
      apiKey: serverEnv.creemApiKey,
      testMode: process.env.NODE_ENV !== 'production',
    },
    {
      database,
      userId,
    }
  );

  if (!status?.hasAccess) {
    return [];
  }

  // 最小实现：将“有任意活跃 Creem 订阅”映射为单一 feature 能力。
  // 具体 feature:* → product/plan 映射由上层按需扩展。
  return ['creem:any-subscription'];
}

export const createCreemExternalAccessProvider =
  (): ExternalAccessProvider => ({
    async hasAccess(
      userId: string,
      capability: AccessCapability
    ): Promise<boolean> {
      if (!userId) {
        return false;
      }

      if (!capability.startsWith('feature:')) {
        // plan:* 能力仍由本地 Billing/Credits/Membership 决定
        return false;
      }

      const featureKey = capability.slice('feature:'.length);

      try {
        const entitlements = await getCreemFeatureEntitlementsForUser(userId);
        return entitlements.includes(featureKey);
      } catch (error) {
        logger.warn(
          { userId, capability, error },
          'Creem external access check failed; falling back to no access'
        );
        return false;
      }
    },
  });
