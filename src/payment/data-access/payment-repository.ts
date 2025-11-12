import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { payment } from '@/db/schema';

export type PaymentRecord = typeof payment.$inferSelect;
export type PaymentInsert = typeof payment.$inferInsert;

type DrizzleDb = Awaited<ReturnType<typeof getDb>>;
type TransactionCallback = Parameters<DrizzleDb['transaction']>[0];
type Transaction = Parameters<TransactionCallback>[0];
export type DbExecutor = DrizzleDb | Transaction;

export class PaymentRepository {
  private async resolveDb(db?: DbExecutor) {
    return db ?? (await getDb());
  }

  async withTransaction<T>(handler: (tx: DbExecutor) => Promise<T>) {
    const db = await getDb();
    return await db.transaction(async (tx) => await handler(tx));
  }

  async listByUser(
    userId: string,
    db?: DbExecutor
  ): Promise<PaymentRecord[]> {
    const client = await this.resolveDb(db);
    return client
      .select()
      .from(payment)
      .where(eq(payment.userId, userId))
      .orderBy(desc(payment.createdAt));
  }

  async findOneBySubscriptionId(
    subscriptionId: string,
    db?: DbExecutor
  ): Promise<PaymentRecord | undefined> {
    const client = await this.resolveDb(db);
    const result = await client
      .select()
      .from(payment)
      .where(eq(payment.subscriptionId, subscriptionId))
      .limit(1);
    return result[0];
  }

  async findBySessionId(
    sessionId: string,
    db?: DbExecutor
  ): Promise<PaymentRecord | undefined> {
    const client = await this.resolveDb(db);
    const result = await client
      .select()
      .from(payment)
      .where(eq(payment.sessionId, sessionId))
      .limit(1);
    return result[0];
  }

  async insert(record: PaymentInsert, db?: DbExecutor): Promise<string | undefined> {
    const client = await this.resolveDb(db);
    const result = await client.insert(payment).values(record).returning({
      id: payment.id,
    });
    return result[0]?.id;
  }

  async upsertSubscription(
    record: PaymentInsert,
    db?: DbExecutor
  ): Promise<string | undefined> {
    const client = await this.resolveDb(db);
    const result = await client
      .insert(payment)
      .values(record)
      .onConflictDoUpdate({
        target: payment.subscriptionId,
        set: {
          priceId: record.priceId,
          interval: record.interval,
          status: record.status,
          periodStart: record.periodStart,
          periodEnd: record.periodEnd,
          cancelAtPeriodEnd: record.cancelAtPeriodEnd,
          trialStart: record.trialStart,
          trialEnd: record.trialEnd,
          updatedAt: record.updatedAt,
        },
      })
      .returning({ id: payment.id });
    return result[0]?.id;
  }

  async updateBySubscriptionId(
    subscriptionId: string,
    updates: Partial<PaymentInsert>,
    db?: DbExecutor
  ): Promise<string | undefined> {
    const client = await this.resolveDb(db);
    const result = await client
      .update(payment)
      .set(updates)
      .where(eq(payment.subscriptionId, subscriptionId))
      .returning({ id: payment.id });
    return result[0]?.id;
  }
}
