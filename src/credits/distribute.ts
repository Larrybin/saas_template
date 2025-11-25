import { featureFlags } from '@/config/feature-flags';
import { getDb } from '@/db';
import { findPlanByPriceId, getAllPricePlans } from '@/lib/price-plan';
import { getLogger } from '@/lib/server/logger';
import {
  type LifetimeMembershipRecord,
  UserLifetimeMembershipRepository,
} from '@/payment/data-access/user-lifetime-membership-repository';
import { createUserBillingReader } from './data-access/user-billing-view';
import { CreditDistributionService } from './distribution/credit-distribution-service';
import {
  collectValidLifetimeMemberships,
  createCachedPlanResolver,
  type LifetimeMembershipResolution,
  type PlanResolver,
  type PlanUserRecord,
} from './domain/lifetime-membership';
import { classifyUsersByPlan } from './domain/plan-classifier';
import { runExpirationJob } from './expiry-job';
import { getPeriodKey } from './utils/period-key';

/**
 * Distribute credits to all users based on their plan type
 * This function is designed to be called by a cron job
 */
const baseLogger = getLogger({ span: 'credits.distribute' });

export type DistributeCreditsDeps = {
  creditDistributionService: CreditDistributionService;
  lifetimeMembershipRepository: UserLifetimeMembershipRepository;
};

const defaultDeps: DistributeCreditsDeps = {
  creditDistributionService: new CreditDistributionService(),
  lifetimeMembershipRepository: new UserLifetimeMembershipRepository(),
};

export type {
  LifetimeMembershipResolution,
  PlanResolver,
  PlanUserRecord,
} from './domain/lifetime-membership';
export {
  collectValidLifetimeMemberships,
  createCachedPlanResolver,
} from './domain/lifetime-membership';
export type { MisconfiguredPaidUser } from './domain/plan-classifier';
export { classifyUsersByPlan } from './domain/plan-classifier';

async function resolveLifetimeMemberships(
  userIds: string[],
  db: Awaited<ReturnType<typeof getDb>>,
  deps: DistributeCreditsDeps,
  resolvePlan: PlanResolver
): Promise<Map<string, LifetimeMembershipResolution>> {
  const membershipsInBatch =
    await deps.lifetimeMembershipRepository.findActiveByUserIds(userIds, db);
  const membershipsByUser = membershipsInBatch.reduce<
    Map<string, LifetimeMembershipRecord[]>
  >((acc, membership) => {
    const existing = acc.get(membership.userId);
    if (existing) {
      existing.push(membership);
    } else {
      acc.set(membership.userId, [membership]);
    }
    return acc;
  }, new Map());

  const perUserResults = new Map<string, LifetimeMembershipResolution>();

  for (const [userId, memberships] of membershipsByUser.entries()) {
    perUserResults.set(
      userId,
      collectValidLifetimeMemberships(memberships, resolvePlan)
    );
  }

  return perUserResults;
}

async function distributeForFreeUsers({
  freeUserIds,
  freePlan,
  periodKey,
  monthLabel,
  batchSize,
  deps,
  log,
}: {
  freeUserIds: string[];
  freePlan: ReturnType<typeof getAllPricePlans>[number] | undefined;
  periodKey: number;
  monthLabel: string;
  batchSize: number;
  deps: DistributeCreditsDeps;
  log: typeof baseLogger;
}) {
  let processedDelta = 0;
  let errorDelta = 0;

  if (!freePlan || freeUserIds.length === 0) {
    return { processedDelta, errorDelta };
  }

  for (let i = 0; i < freeUserIds.length; i += batchSize) {
    const batch = freeUserIds.slice(i, i + batchSize);
    const commands = deps.creditDistributionService.generateFreeCommands({
      userIds: batch,
      plan: freePlan,
      periodKey,
      monthLabel,
    });
    if (commands.length === 0) {
      continue;
    }
    const result = await deps.creditDistributionService.execute(commands);
    processedDelta += result.processed;
    errorDelta += result.errors.length;
    if (result.errors.length > 0) {
      log.error(
        {
          errors: result.errors,
          batch: i / batchSize + 1,
          flagEnabled: result.flagEnabled,
        },
        'Failed to distribute monthly free credits for some users'
      );
    }
    if (freeUserIds.length > batchSize * 10) {
      log.debug(
        {
          processed: Math.min(i + batchSize, freeUserIds.length),
          total: freeUserIds.length,
          segment: 'free',
          flagEnabled: result.flagEnabled,
        },
        'Progress distributing credits'
      );
    }
  }

  return { processedDelta, errorDelta };
}

async function distributeForLifetimeUsers({
  lifetimeUsers,
  periodKey,
  monthLabel,
  batchSize,
  deps,
  log,
}: {
  lifetimeUsers: PlanUserRecord[];
  periodKey: number;
  monthLabel: string;
  batchSize: number;
  deps: DistributeCreditsDeps;
  log: typeof baseLogger;
}) {
  let processedDelta = 0;
  let errorDelta = 0;

  for (let i = 0; i < lifetimeUsers.length; i += batchSize) {
    const batch = lifetimeUsers.slice(i, i + batchSize);
    const commands = deps.creditDistributionService.generateLifetimeCommands({
      users: batch,
      periodKey,
      monthLabel,
    });
    if (commands.length === 0) {
      continue;
    }
    const result = await deps.creditDistributionService.execute(commands);
    processedDelta += result.processed;
    errorDelta += result.errors.length;
    if (result.errors.length > 0) {
      log.error(
        {
          errors: result.errors,
          batch: i / batchSize + 1,
          flagEnabled: result.flagEnabled,
        },
        'Failed to distribute lifetime monthly credits'
      );
    }

    if (lifetimeUsers.length > batchSize * 10) {
      log.debug(
        {
          processed: Math.min(i + batchSize, lifetimeUsers.length),
          total: lifetimeUsers.length,
          segment: 'lifetime',
          flagEnabled: result.flagEnabled,
        },
        'Progress distributing credits'
      );
    }
  }

  return { processedDelta, errorDelta };
}

async function distributeForYearlyUsers({
  yearlyUsers,
  periodKey,
  monthLabel,
  batchSize,
  deps,
  log,
}: {
  yearlyUsers: PlanUserRecord[];
  periodKey: number;
  monthLabel: string;
  batchSize: number;
  deps: DistributeCreditsDeps;
  log: typeof baseLogger;
}) {
  let processedDelta = 0;
  let errorDelta = 0;

  for (let i = 0; i < yearlyUsers.length; i += batchSize) {
    const batch = yearlyUsers.slice(i, i + batchSize);
    const commands = deps.creditDistributionService.generateYearlyCommands({
      users: batch,
      periodKey,
      monthLabel,
    });
    if (commands.length === 0) {
      continue;
    }
    const result = await deps.creditDistributionService.execute(commands);
    processedDelta += result.processed;
    errorDelta += result.errors.length;
    if (result.errors.length > 0) {
      log.error(
        {
          errors: result.errors,
          batch: i / batchSize + 1,
          flagEnabled: result.flagEnabled,
        },
        'Failed to distribute yearly monthly credits'
      );
    }

    if (yearlyUsers.length > batchSize * 10) {
      log.debug(
        {
          processed: Math.min(i + batchSize, yearlyUsers.length),
          total: yearlyUsers.length,
          segment: 'yearly',
          flagEnabled: result.flagEnabled,
        },
        'Progress distributing credits'
      );
    }
  }

  return { processedDelta, errorDelta };
}

export async function distributeCreditsToAllUsers(
  options?: {
    refDate?: Date;
  },
  deps: DistributeCreditsDeps = defaultDeps
) {
  const log = baseLogger.child({ span: 'distributeCreditsToAllUsers' });
  log.info('Starting credit distribution job');

  // Process expired credits first before distributing new credits
  log.debug('Processing expired credits before distribution');
  const expiredResult = await runExpirationJob();
  log.debug({ expiredResult }, 'Finished processing expired credits');

  const db = await getDb();
  const billingReader = createUserBillingReader(db);

  const now = options?.refDate ?? new Date();
  const monthLabel = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const periodKey = getPeriodKey(now);
  const freePlan = getAllPricePlans().find(
    (plan) =>
      plan.isFree && plan.credits?.enable && (plan.credits.amount ?? 0) > 0
  );

  let processedCount = 0;
  let errorCount = 0;
  let usersCount = 0;
  let lastProcessedUserId: string | null = null;

  const userBatchSize = 1000;
  const batchSize = 100;

  if (!freePlan) {
    log.info('Free plan credits disabled, skipping free users');
  }

  const resolvePlan = createCachedPlanResolver(findPlanByPriceId);

  do {
    const userBatch = await billingReader.fetchBatch(
      lastProcessedUserId,
      userBatchSize
    );
    if (userBatch.length === 0) {
      break;
    }

    usersCount += userBatch.length;

    const userIdsInBatch = userBatch.map((record) => record.userId);
    const perUserMembershipResults = await resolveLifetimeMemberships(
      userIdsInBatch,
      db,
      deps,
      resolvePlan
    );

    // log invalid memberships
    for (const [userId, result] of perUserMembershipResults.entries()) {
      if (result.invalidMemberships.length > 0) {
        log.warn(
          {
            userId,
            priceIds: result.invalidMemberships.map(
              (membership) => membership.priceId
            ),
          },
          'Lifetime membership missing valid plan configuration, falling back to free credits'
        );
      }
    }

    const { freeUserIds, lifetimeUsers, yearlyUsers, misconfiguredPaidUsers } =
      classifyUsersByPlan(userBatch, perUserMembershipResults, resolvePlan);

    if (misconfiguredPaidUsers.length > 0) {
      log.warn(
        {
          users: misconfiguredPaidUsers,
        },
        'Paid users missing yearly pricing configuration, falling back to free credits'
      );
    }

    const freeResult = await distributeForFreeUsers({
      freeUserIds,
      freePlan,
      periodKey,
      monthLabel,
      batchSize,
      deps,
      log,
    });
    processedCount += freeResult.processedDelta;
    errorCount += freeResult.errorDelta;

    const lifetimeResult = await distributeForLifetimeUsers({
      lifetimeUsers,
      periodKey,
      monthLabel,
      batchSize,
      deps,
      log,
    });
    processedCount += lifetimeResult.processedDelta;
    errorCount += lifetimeResult.errorDelta;

    const yearlyResult = await distributeForYearlyUsers({
      yearlyUsers,
      periodKey,
      monthLabel,
      batchSize,
      deps,
      log,
    });
    processedCount += yearlyResult.processedDelta;
    errorCount += yearlyResult.errorDelta;

    lastProcessedUserId = userBatch[userBatch.length - 1]?.userId ?? null;
  } while (lastProcessedUserId);

  log.info(
    {
      usersCount,
      processedCount,
      errorCount,
      enableCreditPeriodKey: featureFlags.enableCreditPeriodKey,
    },
    'Finished credit distribution job'
  );
  return { usersCount, processedCount, errorCount };
}
