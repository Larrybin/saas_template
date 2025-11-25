import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { featureFlags } from '@/config/feature-flags';
import { getDb } from '@/db';
import { payment, user } from '@/db/schema';
import { findPlanByPriceId, getAllPricePlans } from '@/lib/price-plan';
import { getLogger } from '@/lib/server/logger';
import {
  type LifetimeMembershipRecord,
  UserLifetimeMembershipRepository,
} from '@/payment/data-access/user-lifetime-membership-repository';
import { PlanIntervals } from '@/payment/types';
import {
  CreditDistributionService,
  type PlanUserRecord,
} from './distribution/credit-distribution-service';
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

type UserWithPayment = {
  userId: string;
  email: string | null;
  name: string | null;
  priceId: string | null;
  paymentStatus: string | null;
  paymentCreatedAt: Date | null;
};

export type LifetimeMembershipResolution = {
  validMemberships: PlanUserRecord[];
  invalidMemberships: LifetimeMembershipRecord[];
  shouldFallbackToFree: boolean;
};

export type PlanResolver = (
  priceId: string | null | undefined
) => ReturnType<typeof findPlanByPriceId>;

export function createCachedPlanResolver(
  resolver: typeof findPlanByPriceId
): PlanResolver {
  const cache = new Map<string, ReturnType<typeof findPlanByPriceId>>();
  return (priceId) => {
    if (!priceId) {
      return undefined;
    }
    if (cache.has(priceId)) {
      return cache.get(priceId);
    }
    const plan = resolver(priceId);
    cache.set(priceId, plan);
    return plan;
  };
}

export function collectValidLifetimeMemberships(
  memberships: LifetimeMembershipRecord[] | undefined,
  resolvePlan: PlanResolver
): LifetimeMembershipResolution {
  if (!memberships || memberships.length === 0) {
    return {
      validMemberships: [],
      invalidMemberships: [],
      shouldFallbackToFree: false,
    };
  }

  const validMemberships: PlanUserRecord[] = [];
  const invalidMemberships: LifetimeMembershipRecord[] = [];

  memberships.forEach((membership) => {
    const plan = resolvePlan(membership.priceId);
    if (plan?.isLifetime && plan.credits?.enable) {
      validMemberships.push({
        userId: membership.userId,
        priceId: membership.priceId,
      });
      return;
    }

    invalidMemberships.push(membership);
  });

  return {
    validMemberships,
    invalidMemberships,
    shouldFallbackToFree: validMemberships.length === 0,
  };
}

function createLatestPaymentSubquery(db: Awaited<ReturnType<typeof getDb>>) {
  return db
    .select({
      userId: payment.userId,
      priceId: payment.priceId,
      status: payment.status,
      createdAt: payment.createdAt,
      rowNumber:
        sql<number>`ROW_NUMBER() OVER (PARTITION BY ${payment.userId} ORDER BY ${payment.createdAt} DESC)`.as(
          'row_number'
        ),
    })
    .from(payment)
    .where(or(eq(payment.status, 'active'), eq(payment.status, 'trialing')))
    .as('latest_payment');
}

async function fetchUsersBatch(
  db: Awaited<ReturnType<typeof getDb>>,
  latestPaymentQuery: ReturnType<typeof createLatestPaymentSubquery>,
  lastUserId: string | null,
  limit: number
): Promise<UserWithPayment[]> {
  const baseCondition = or(isNull(user.banned), eq(user.banned, false));
  const paginationCondition = lastUserId
    ? and(baseCondition, gt(user.id, lastUserId))
    : baseCondition;

  return await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      priceId: latestPaymentQuery.priceId,
      paymentStatus: latestPaymentQuery.status,
      paymentCreatedAt: latestPaymentQuery.createdAt,
    })
    .from(user)
    .leftJoin(
      latestPaymentQuery,
      and(
        eq(user.id, latestPaymentQuery.userId),
        eq(latestPaymentQuery.rowNumber, 1)
      )
    )
    .where(paginationCondition)
    .orderBy(user.id)
    .limit(limit);
}

async function resolveLifetimeMemberships(
  userIds: string[],
  db: Awaited<ReturnType<typeof getDb>>,
  deps: DistributeCreditsDeps,
  resolvePlan: PlanResolver
) {
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

export function classifyUsersByPlan(
  userBatch: UserWithPayment[],
  membershipsByUser: Map<string, LifetimeMembershipResolution>,
  resolvePlan: PlanResolver
) {
  const freeUserIds: string[] = [];
  const lifetimeUsers: PlanUserRecord[] = [];
  const yearlyUsers: PlanUserRecord[] = [];

  userBatch.forEach((userRecord) => {
    const membershipResult = membershipsByUser.get(userRecord.userId);
    if (membershipResult) {
      if (membershipResult.validMemberships.length > 0) {
        lifetimeUsers.push(...membershipResult.validMemberships);
      }
      if (
        membershipResult.invalidMemberships.length > 0 &&
        membershipResult.shouldFallbackToFree
      ) {
        freeUserIds.push(userRecord.userId);
      }
      return;
    }

    if (
      userRecord.priceId &&
      userRecord.paymentStatus &&
      (userRecord.paymentStatus === 'active' ||
        userRecord.paymentStatus === 'trialing')
    ) {
      const pricePlan = resolvePlan(userRecord.priceId);
      if (pricePlan?.isLifetime && pricePlan?.credits?.enable) {
        lifetimeUsers.push({
          userId: userRecord.userId,
          priceId: userRecord.priceId,
        });
      } else if (!pricePlan?.isFree && pricePlan?.credits?.enable) {
        const yearlyPrice = pricePlan?.prices?.find(
          (p) =>
            p.priceId === userRecord.priceId &&
            p.interval === PlanIntervals.YEAR
        );
        if (yearlyPrice) {
          yearlyUsers.push({
            userId: userRecord.userId,
            priceId: userRecord.priceId,
          });
        }
      }
    } else {
      freeUserIds.push(userRecord.userId);
    }
  });

  return { freeUserIds, lifetimeUsers, yearlyUsers };
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
  const latestPaymentQuery = createLatestPaymentSubquery(db);

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
    const userBatch = await fetchUsersBatch(
      db,
      latestPaymentQuery,
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

    const { freeUserIds, lifetimeUsers, yearlyUsers } = classifyUsersByPlan(
      userBatch,
      perUserMembershipResults,
      resolvePlan
    );

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
