import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkNewsletterStatusAction } from '@/actions/check-newsletter-status';
import { subscribeNewsletterAction } from '@/actions/subscribe-newsletter';
import { unsubscribeNewsletterAction } from '@/actions/unsubscribe-newsletter';
import {
  handleAuthFromEnvelope,
  useAuthErrorHandler,
} from '@/hooks/use-auth-error-handler';
import {
  type EnvelopeWithDomainError,
  unwrapEnvelopeOrThrowDomainError,
} from '@/lib/domain-error-utils';

type Envelope<T> = EnvelopeWithDomainError<T>;

// Query keys
export const newsletterKeys = {
  all: ['newsletter'] as const,
  status: (email: string) => [...newsletterKeys.all, 'status', email] as const,
};

// Hook to check newsletter subscription status
export function useNewsletterStatus(email: string | undefined) {
  const handleAuthError = useAuthErrorHandler();

  return useQuery({
    queryKey: newsletterKeys.status(email || ''),
    queryFn: async () => {
      if (!email) {
        throw new Error('Email is required');
      }
      const result = await checkNewsletterStatusAction({ email });
      const data = unwrapEnvelopeOrThrowDomainError<{
        success: true;
        subscribed: boolean;
      }>(
        result?.data as
          | Envelope<{ success: true; subscribed: boolean }>
          | undefined,
        {
          defaultErrorMessage: 'Failed to check newsletter status',
          handleAuthEnvelope: (payload) =>
            handleAuthFromEnvelope(handleAuthError, payload),
        }
      );
      return { subscribed: data.subscribed };
    },
    enabled: !!email,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook to subscribe to newsletter
export function useSubscribeNewsletter() {
  const queryClient = useQueryClient();
  const handleAuthError = useAuthErrorHandler();

  return useMutation({
    mutationFn: async (email: string) => {
      const result = await subscribeNewsletterAction({ email });
      const data = unwrapEnvelopeOrThrowDomainError<{
        success: true;
      }>(result?.data as Envelope<{ success: true }> | undefined, {
        defaultErrorMessage: 'Failed to subscribe to newsletter',
        handleAuthEnvelope: (payload) =>
          handleAuthFromEnvelope(handleAuthError, payload),
      });
      return data;
    },
    onSuccess: (_, email) => {
      // Invalidate and refetch the newsletter status
      queryClient.invalidateQueries({
        queryKey: newsletterKeys.status(email),
      });
    },
  });
}

// Hook to unsubscribe from newsletter
export function useUnsubscribeNewsletter() {
  const queryClient = useQueryClient();
  const handleAuthError = useAuthErrorHandler();

  return useMutation({
    mutationFn: async (email: string) => {
      const result = await unsubscribeNewsletterAction({ email });
      const data = unwrapEnvelopeOrThrowDomainError<{
        success: true;
      }>(result?.data as Envelope<{ success: true }> | undefined, {
        defaultErrorMessage: 'Failed to unsubscribe from newsletter',
        handleAuthEnvelope: (payload) =>
          handleAuthFromEnvelope(handleAuthError, payload),
      });
      return data;
    },
    onSuccess: (_, email) => {
      // Invalidate and refetch the newsletter status
      queryClient.invalidateQueries({
        queryKey: newsletterKeys.status(email),
      });
    },
  });
}
