import { getActiveSubscriptionAction } from '@/actions/get-active-subscription';
import { getLifetimeStatusAction } from '@/actions/get-lifetime-status';
import { getAllPricePlans } from '@/lib/price-plan';
import type { PricePlan, Subscription } from '@/payment/types';
import { useQuery } from '@tanstack/react-query';

// Query keys
export const paymentKeys = {
  all: ['payment'] as const,
  subscription: (userId: string) =>
    [...paymentKeys.all, 'subscription', userId] as const,
  lifetime: (userId: string) =>
    [...paymentKeys.all, 'lifetime', userId] as const,
  currentPlan: (userId: string) =>
    [...paymentKeys.all, 'currentPlan', userId] as const,
};

// Hook to fetch active subscription
export function useActiveSubscription(userId: string | undefined) {
  return useQuery({
    queryKey: paymentKeys.subscription(userId || ''),
    queryFn: async (): Promise<Subscription | null> => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const result = await getActiveSubscriptionAction({ userId });
      if (!result?.data?.success) {
        throw new Error(result?.data?.error || 'Failed to fetch subscription');
      }
      return result.data.data || null;
    },
    enabled: !!userId,
  });
}

// Hook to fetch lifetime status
export function useLifetimeStatus(userId: string | undefined) {
  return useQuery({
    queryKey: paymentKeys.lifetime(userId || ''),
    queryFn: async (): Promise<boolean> => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const result = await getLifetimeStatusAction({ userId });
      if (!result?.data?.success) {
        throw new Error(
          result?.data?.error || 'Failed to fetch lifetime status'
        );
      }
      return result.data.isLifetimeMember || false;
    },
    enabled: !!userId,
  });
}

// Hook to get current plan based on subscription and lifetime status
export function useCurrentPlan(userId: string | undefined) {
  const {
    data: subscription,
    isLoading: isLoadingSubscription,
    error: subscriptionError,
  } = useActiveSubscription(userId);
  const {
    data: isLifetimeMember,
    isLoading: isLoadingLifetime,
    error: lifetimeError,
  } = useLifetimeStatus(userId);

  return useQuery({
    queryKey: paymentKeys.currentPlan(userId || ''),
    queryFn: async (): Promise<{
      currentPlan: PricePlan | null;
      subscription: Subscription | null;
    }> => {
      const plans: PricePlan[] = getAllPricePlans();
      const freePlan = plans.find((plan) => plan.isFree);
      const lifetimePlan = plans.find((plan) => plan.isLifetime);

      // If lifetime member, return lifetime plan
      if (isLifetimeMember) {
        return {
          currentPlan: lifetimePlan || null,
          subscription: null,
        };
      }

      // If has active subscription, find the corresponding plan
      if (subscription) {
        const plan =
          plans.find((p) =>
            p.prices.find((price) => price.priceId === subscription.priceId)
          ) || null;
        return {
          currentPlan: plan,
          subscription,
        };
      }

      // Default to free plan
      return {
        currentPlan: freePlan || null,
        subscription: null,
      };
    },
    enabled: !!userId && !isLoadingSubscription && !isLoadingLifetime,
  });
}
