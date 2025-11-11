import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { stripeEvent } from '@/db/schema';

export class StripeEventRepository {
  async find(eventId: string) {
    const db = await getDb();
    const result = await db
      .select()
      .from(stripeEvent)
      .where(eq(stripeEvent.eventId, eventId))
      .limit(1);
    return result[0];
  }

  async record(event: {
    eventId: string;
    type: string;
    createdAt: Date;
  }): Promise<void> {
    const db = await getDb();
    await db
      .insert(stripeEvent)
      .values(event)
      .onConflictDoNothing({ target: stripeEvent.eventId });
  }

  async markProcessed(eventId: string): Promise<void> {
    const db = await getDb();
    await db
      .update(stripeEvent)
      .set({ processedAt: new Date() })
      .where(eq(stripeEvent.eventId, eventId));
  }
}
