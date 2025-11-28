import type {
  getSubscriptionsParams,
  PaymentStatus,
  PaymentTypes,
  PlanInterval,
  Subscription,
} from '../types';
import type { PaymentRepositoryLike } from './stripe-deps';

type SubscriptionQueryServiceDeps = {
  paymentRepository: PaymentRepositoryLike;
};

export class SubscriptionQueryService {
  private readonly paymentRepository: PaymentRepositoryLike;

  constructor(deps: SubscriptionQueryServiceDeps) {
    this.paymentRepository = deps.paymentRepository;
  }

  async getSubscriptions(
    params: getSubscriptionsParams
  ): Promise<Subscription[]> {
    const records = await this.paymentRepository.listByUser(params.userId);

    return records.map((record) => {
      const currentPeriodStart = record.periodStart ?? undefined;
      const currentPeriodEnd = record.periodEnd ?? undefined;
      const trialStartDate = record.trialStart ?? undefined;
      const trialEndDate = record.trialEnd ?? undefined;

      return {
        id: record.subscriptionId ?? '',
        customerId: record.customerId,
        priceId: record.priceId,
        status: record.status as PaymentStatus,
        type: record.type as PaymentTypes,
        interval: record.interval as PlanInterval,
        ...(currentPeriodStart ? { currentPeriodStart } : {}),
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        cancelAtPeriodEnd: record.cancelAtPeriodEnd ?? false,
        ...(trialStartDate ? { trialStartDate } : {}),
        ...(trialEndDate ? { trialEndDate } : {}),
        createdAt: record.createdAt,
      };
    });
  }
}
