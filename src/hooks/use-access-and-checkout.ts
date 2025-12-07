import { useMutation } from '@tanstack/react-query';
import { ensureAccessAndCheckoutAction } from '@/actions/ensure-access-and-checkout';
import {
  handleAuthFromEnvelope,
  useAuthErrorHandler,
} from '@/hooks/use-auth-error-handler';
import type { AccessCapability } from '@/lib/auth-domain';
import {
  type EnvelopeWithDomainError,
  unwrapEnvelopeOrThrowDomainError,
} from '@/lib/domain-error-utils';

type EnsureAccessAndCheckoutSuccess = {
  success: true;
  data: {
    alreadyHasAccess: boolean;
    checkoutUrl?: string;
    checkoutId?: string;
  };
};

type Envelope<T> = EnvelopeWithDomainError<T>;

type UseAccessAndCheckoutArgs = {
  capability: AccessCapability | string;
  mode: 'subscription' | 'credits';
  planId?: string | undefined;
  priceId?: string | undefined;
  packageId?: string | undefined;
  metadata?: Record<string, string> | undefined;
};

type UseAccessAndCheckoutResult = {
  hasAccess: boolean;
  isLoading: boolean;
  startCheckout: () => Promise<void>;
};

export function useAccessAndCheckout(
  args: UseAccessAndCheckoutArgs
): UseAccessAndCheckoutResult {
  const handleAuthError = useAuthErrorHandler();

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await ensureAccessAndCheckoutAction({
        mode: args.mode,
        capability: args.capability,
        planId: args.planId,
        priceId: args.priceId,
        packageId: args.packageId,
        metadata: args.metadata,
      });

      const data =
        unwrapEnvelopeOrThrowDomainError<EnsureAccessAndCheckoutSuccess>(
          result?.data as Envelope<EnsureAccessAndCheckoutSuccess> | undefined,
          {
            defaultErrorMessage: 'Failed to ensure access and start checkout',
            handleAuthEnvelope: (payload) =>
              handleAuthFromEnvelope(handleAuthError, payload),
          }
        );

      return data;
    },
    onSuccess: (data) => {
      if (data.data.alreadyHasAccess) {
        return;
      }
      if (data.data.checkoutUrl) {
        window.location.href = data.data.checkoutUrl;
      }
    },
  });

  return {
    hasAccess: Boolean(mutation.data?.data.alreadyHasAccess),
    isLoading: mutation.isPending,
    startCheckout: async () => {
      await mutation.mutateAsync();
    },
  };
}
