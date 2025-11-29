import { randomUUID } from 'node:crypto';
import { and, inArray, isNull } from 'drizzle-orm';

import { getDb } from '@/db';
import { userLifetimeMembership } from '@/db/schema';
import type {
  LifetimeMembershipRecord,
  LifetimeMembershipRepository,
  UpsertLifetimeMembershipInput,
} from '@/domain/membership';

type DrizzleDb = Awaited<ReturnType<typeof getDb>>;
type TransactionCallback = Parameters<DrizzleDb['transaction']>[0];
type Transaction = Parameters<TransactionCallback>[0];
export type DbExecutor = DrizzleDb | Transaction;

type LifetimeMembershipRow = typeof userLifetimeMembership.$inferSelect;

export class UserLifetimeMembershipRepository
  implements LifetimeMembershipRepository<DbExecutor>
{
  private async resolveDb(db?: DbExecutor) {
    return db ?? (await getDb());
  }

  async upsertMembership(
    input: UpsertLifetimeMembershipInput,
    db?: DbExecutor
  ): Promise<void> {
    const client = await this.resolveDb(db);
    await client
      .insert(userLifetimeMembership)
      .values({
        id: randomUUID(),
        userId: input.userId,
        priceId: input.priceId,
        cycleRefDate: input.cycleRefDate,
        revokedAt: input.revokedAt ?? null,
      })
      .onConflictDoUpdate({
        target: [userLifetimeMembership.userId, userLifetimeMembership.priceId],
        set: {
          cycleRefDate: input.cycleRefDate,
          revokedAt: input.revokedAt ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async findActiveByUserIds(
    userIds: string[],
    db?: DbExecutor
  ): Promise<LifetimeMembershipRecord[]> {
    if (userIds.length === 0) {
      return [];
    }
    const client = await this.resolveDb(db);
    const rows: LifetimeMembershipRow[] = await client
      .select()
      .from(userLifetimeMembership)
      .where(
        and(
          inArray(userLifetimeMembership.userId, userIds),
          isNull(userLifetimeMembership.revokedAt)
        )
      );
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      priceId: row.priceId,
      cycleRefDate: row.cycleRefDate,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      revokedAt: row.revokedAt,
    }));
  }
}
