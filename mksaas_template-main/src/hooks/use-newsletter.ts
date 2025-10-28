import { checkNewsletterStatusAction } from '@/actions/check-newsletter-status';
import { subscribeNewsletterAction } from '@/actions/subscribe-newsletter';
import { unsubscribeNewsletterAction } from '@/actions/unsubscribe-newsletter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Query keys
export const newsletterKeys = {
  all: ['newsletter'] as const,
  status: (email: string) => [...newsletterKeys.all, 'status', email] as const,
};

// Hook to check newsletter subscription status
export function useNewsletterStatus(email: string | undefined) {
  return useQuery({
    queryKey: newsletterKeys.status(email || ''),
    queryFn: async () => {
      if (!email) {
        throw new Error('Email is required');
      }
      const result = await checkNewsletterStatusAction({ email });
      if (!result?.data?.success) {
        throw new Error(
          result?.data?.error || 'Failed to check newsletter status'
        );
      }
      return result.data;
    },
    enabled: !!email,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook to subscribe to newsletter
export function useSubscribeNewsletter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (email: string) => {
      const result = await subscribeNewsletterAction({ email });
      if (!result?.data?.success) {
        throw new Error(
          result?.data?.error || 'Failed to subscribe to newsletter'
        );
      }
      return result.data;
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

  return useMutation({
    mutationFn: async (email: string) => {
      const result = await unsubscribeNewsletterAction({ email });
      if (!result?.data?.success) {
        throw new Error(
          result?.data?.error || 'Failed to unsubscribe from newsletter'
        );
      }
      return result.data;
    },
    onSuccess: (_, email) => {
      // Invalidate and refetch the newsletter status
      queryClient.invalidateQueries({
        queryKey: newsletterKeys.status(email),
      });
    },
  });
}
