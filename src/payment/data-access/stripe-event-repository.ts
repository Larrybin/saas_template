import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { stripeEvent } from '@/db/schema';
import type {
  PaymentEventProviderId,
  PaymentEventRepository,
} from './payment-event-repository';

export class StripeEventRepository implements PaymentEventRepository {
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

  async withEventProcessingLock<T>(
    providerId: PaymentEventProviderId,
    event: {
      eventId: string;
      type: string;
      createdAt: Date;
      payload?: string;
    },
    handler: () => Promise<T>
  ): Promise<{ skipped: boolean; result?: T }> {
    if (providerId !== 'stripe') {
      throw new Error(
        `StripeEventRepository only supports providerId 'stripe', got '${providerId}'`
      );
    }

    const db = await getDb();
    return db.transaction(async (tx) => {
      await tx
        .insert(stripeEvent)
        .values({
          eventId: event.eventId,
          type: event.type,
          createdAt: event.createdAt,
        })
        .onConflictDoNothing({ target: stripeEvent.eventId });

      const result = await tx
        .select()
        .from(stripeEvent)
        .where(eq(stripeEvent.eventId, event.eventId))
        .for('update')
        .limit(1);
      const record = result[0];
      if (!record) {
        throw new Error('Failed to load stripe event record');
      }
      if (record.processedAt) {
        return { skipped: true };
      }
      const handlerResult = await handler();
      await tx
        .update(stripeEvent)
        .set({ processedAt: new Date() })
        .where(eq(stripeEvent.eventId, event.eventId));
      return { skipped: false, result: handlerResult };
    });
  }
}
