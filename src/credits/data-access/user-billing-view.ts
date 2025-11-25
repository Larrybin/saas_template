import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { getDb } from '@/db';
import { payment, user } from '@/db/schema';
import type { UserBillingSnapshot } from '../domain/plan-classifier';

type Db = Awaited<ReturnType<typeof getDb>>;

type LatestPaymentSubquery = ReturnType<typeof createLatestPaymentSubquery>;

function createLatestPaymentSubquery(db: Db) {
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
  db: Db,
  latestPaymentQuery: LatestPaymentSubquery,
  lastUserId: string | null,
  limit: number
): Promise<UserBillingSnapshot[]> {
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

export type UserBillingReader = {
  fetchBatch(
    lastUserId: string | null,
    limit: number
  ): Promise<UserBillingSnapshot[]>;
};

export function createUserBillingReader(db: Db): UserBillingReader {
  const latestPaymentQuery = createLatestPaymentSubquery(db);

  return {
    async fetchBatch(lastUserId, limit) {
      return fetchUsersBatch(db, latestPaymentQuery, lastUserId, limit);
    },
  };
}

