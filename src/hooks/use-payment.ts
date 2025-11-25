import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getActiveSubscriptionAction } from '@/actions/get-active-subscription';
import { getLifetimeStatusAction } from '@/actions/get-lifetime-status';
import { resolveCurrentPlan } from '@/domain/plan/resolve-current-plan';
import {
  handleAuthFromEnvelope,
  useAuthErrorHandler,
} from '@/hooks/use-auth-error-handler';
import {
  type EnvelopeWithDomainError,
  unwrapEnvelopeOrThrowDomainError,
} from '@/lib/domain-error-utils';
import { getAllPricePlans } from '@/lib/price-plan';
import type { PricePlan, Subscription } from '@/payment/types';

type Envelope<T> = EnvelopeWithDomainError<T>;

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
  const handleAuthError = useAuthErrorHandler();

  return useQuery({
    queryKey: paymentKeys.subscription(userId || ''),
    queryFn: async (): Promise<Subscription | null> => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const result = await getActiveSubscriptionAction({ userId });
      const data = unwrapEnvelopeOrThrowDomainError<{
        success: true;
        data: Subscription | null;
      }>(
        result?.data as
          | Envelope<{ success: true; data: Subscription | null }>
          | undefined,
        {
          defaultErrorMessage: 'Failed to fetch subscription',
          handleAuthEnvelope: (payload) =>
            handleAuthFromEnvelope(handleAuthError, payload),
        }
      );
      return data.data || null;
    },
    enabled: !!userId,
  });
}

// Hook to fetch lifetime status
export function useLifetimeStatus(userId: string | undefined) {
  const handleAuthError = useAuthErrorHandler();

  return useQuery({
    queryKey: paymentKeys.lifetime(userId || ''),
    queryFn: async (): Promise<boolean> => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const result = await getLifetimeStatusAction({ userId });
      const data = unwrapEnvelopeOrThrowDomainError<{
        success: true;
        isLifetimeMember: boolean;
      }>(
        result?.data as
          | Envelope<{ success: true; isLifetimeMember: boolean }>
          | undefined,
        {
          defaultErrorMessage: 'Failed to fetch lifetime status',
          handleAuthEnvelope: (payload) =>
            handleAuthFromEnvelope(handleAuthError, payload),
        }
      );
      return data.isLifetimeMember || false;
    },
    enabled: !!userId,
  });
}

// Hook to get current plan based on subscription and lifetime status
export function useCurrentPlan(userId: string | undefined) {
  const plans = useMemo(() => getAllPricePlans(), []);
  const {
    data: subscription,
    isLoading: isLoadingSubscription,
    error: _subscriptionError,
  } = useActiveSubscription(userId);
  const {
    data: isLifetimeMember,
    isLoading: isLoadingLifetime,
    error: _lifetimeError,
  } = useLifetimeStatus(userId);

  return useQuery({
    queryKey: paymentKeys.currentPlan(userId || ''),
    queryFn: async (): Promise<{
      currentPlan: PricePlan | null;
      subscription: Subscription | null;
    }> =>
      resolveCurrentPlan({
        plans,
        subscription: subscription ?? null,
        isLifetimeMember: Boolean(isLifetimeMember),
      }),
    enabled: !!userId && !isLoadingSubscription && !isLoadingLifetime,
  });
}
