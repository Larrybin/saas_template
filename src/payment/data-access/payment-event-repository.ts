export type PaymentEventProviderId = 'stripe' | 'creem';

export interface PaymentEventRepository {
  withEventProcessingLock<T>(
    providerId: PaymentEventProviderId,
    event: {
      eventId: string;
      type: string;
      createdAt: Date;
      payload?: string;
    },
    handler: () => Promise<T>
  ): Promise<{ skipped: boolean; result?: T }>;
}
