import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { creemEvent } from '@/db/schema';
import type {
  PaymentEventProviderId,
  PaymentEventRepository,
} from './payment-event-repository';

export class CreemEventRepository implements PaymentEventRepository {
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
    if (providerId !== 'creem') {
      throw new Error(
        `CreemEventRepository only supports providerId 'creem', got '${providerId}'`
      );
    }

    const db = await getDb();

    return db.transaction(async (tx) => {
      await tx
        .insert(creemEvent)
        .values({
          eventId: event.eventId,
          type: event.type,
          createdAt: event.createdAt,
          payload: event.payload ?? '',
        })
        .onConflictDoNothing({ target: creemEvent.eventId });

      const result = await tx
        .select()
        .from(creemEvent)
        .where(eq(creemEvent.eventId, event.eventId))
        .for('update')
        .limit(1);
      const record = result[0];
      if (!record) {
        throw new Error('Failed to load creem event record');
      }
      if (record.processedAt) {
        return { skipped: true };
      }

      const handlerResult = await handler();

      await tx
        .update(creemEvent)
        .set({ processedAt: new Date() })
        .where(eq(creemEvent.eventId, event.eventId));

      return { skipped: false, result: handlerResult };
    });
  }
}
