import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { payment } from '@/db/schema';

export type PaymentRecord = typeof payment.$inferSelect;
export type PaymentInsert = typeof payment.$inferInsert;

export class PaymentRepository {
  async listByUser(userId: string): Promise<PaymentRecord[]> {
    const db = await getDb();
    return db
      .select()
      .from(payment)
      .where(eq(payment.userId, userId))
      .orderBy(desc(payment.createdAt));
  }

  async findOneBySubscriptionId(
    subscriptionId: string
  ): Promise<PaymentRecord | undefined> {
    const db = await getDb();
    const result = await db
      .select()
      .from(payment)
      .where(eq(payment.subscriptionId, subscriptionId))
      .limit(1);
    return result[0];
  }

  async findBySessionId(sessionId: string): Promise<PaymentRecord | undefined> {
    const db = await getDb();
    const result = await db
      .select()
      .from(payment)
      .where(eq(payment.sessionId, sessionId))
      .limit(1);
    return result[0];
  }

  async insert(record: PaymentInsert): Promise<string | undefined> {
    const db = await getDb();
    const result = await db.insert(payment).values(record).returning({
      id: payment.id,
    });
    return result[0]?.id;
  }

  async upsertSubscription(record: PaymentInsert): Promise<string | undefined> {
    const db = await getDb();
    const result = await db
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
    updates: Partial<PaymentInsert>
  ): Promise<string | undefined> {
    const db = await getDb();
    const result = await db
      .update(payment)
      .set(updates)
      .where(eq(payment.subscriptionId, subscriptionId))
      .returning({ id: payment.id });
    return result[0]?.id;
  }
}
