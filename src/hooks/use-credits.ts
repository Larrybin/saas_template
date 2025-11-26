import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import { consumeCreditsAction } from '@/actions/consume-credits';
import { getCreditBalanceAction } from '@/actions/get-credit-balance';
import { getCreditStatsAction } from '@/actions/get-credit-stats';
import { getCreditTransactionsAction } from '@/actions/get-credit-transactions';
import type { CreditTransaction } from '@/components/settings/credits/credit-transactions-table';
import {
  handleAuthFromEnvelope,
  useAuthErrorHandler,
} from '@/hooks/use-auth-error-handler';
import { clientLogger } from '@/lib/client-logger';
import {
  type EnvelopeWithDomainError,
  unwrapEnvelopeOrThrowDomainError,
} from '@/lib/domain-error-utils';

type CreditBalanceSuccess = { success: true; credits: number };

type CreditStatsSuccess = {
  success: true;
  data: {
    expiringCredits: {
      amount: number;
    };
  };
};

type CreditTransactionsSuccess = {
  success: true;
  data: {
    items: CreditTransaction[];
    total: number;
  };
};
type Envelope<T> = EnvelopeWithDomainError<T>;

// Query keys
export const creditsKeys = {
  all: ['credits'] as const,
  balance: () => [...creditsKeys.all, 'balance'] as const,
  stats: () => [...creditsKeys.all, 'stats'] as const,
  transactions: () => [...creditsKeys.all, 'transactions'] as const,
  transactionsList: (filters: {
    pageIndex: number;
    pageSize: number;
    search: string;
    sorting: SortingState;
  }) => [...creditsKeys.transactions(), filters] as const,
};

// Hook to fetch credit balance
export function useCreditBalance() {
  const handleAuthError = useAuthErrorHandler();

  return useQuery({
    queryKey: creditsKeys.balance(),
    queryFn: async () => {
      clientLogger.debug('Fetching credit balance...');
      const result = await getCreditBalanceAction();
      const data = unwrapEnvelopeOrThrowDomainError<CreditBalanceSuccess>(
        result?.data as Envelope<CreditBalanceSuccess> | undefined,
        {
          defaultErrorMessage: 'Failed to fetch credit balance',
          handleAuthEnvelope: (payload) =>
            handleAuthFromEnvelope(handleAuthError, payload),
        }
      );
      clientLogger.debug('Credit balance fetched:', data.credits);
      return data.credits || 0;
    },
  });
}

// Hook to fetch credit statistics
export function useCreditStats() {
  const handleAuthError = useAuthErrorHandler();

  return useQuery({
    queryKey: creditsKeys.stats(),
    queryFn: async () => {
      clientLogger.debug('Fetching credit stats...');
      const result = await getCreditStatsAction();
      const data = unwrapEnvelopeOrThrowDomainError<CreditStatsSuccess>(
        result?.data as Envelope<CreditStatsSuccess> | undefined,
        {
          defaultErrorMessage: 'Failed to fetch credit stats',
          handleAuthEnvelope: (payload) =>
            handleAuthFromEnvelope(handleAuthError, payload),
        }
      );
      clientLogger.debug('Credit stats fetched:', data.data);
      return data.data;
    },
  });
}

// Hook to consume credits
export function useConsumeCredits() {
  const queryClient = useQueryClient();
  const handleAuthError = useAuthErrorHandler();

  return useMutation({
    mutationFn: async ({
      amount,
      description,
    }: {
      amount: number;
      description: string;
    }) => {
      const result = await consumeCreditsAction({
        amount,
        description,
      });
      const data = unwrapEnvelopeOrThrowDomainError<{
        success: true;
      }>(result?.data as Envelope<{ success: true }> | undefined, {
        defaultErrorMessage: 'Failed to consume credits',
        handleAuthEnvelope: (payload) =>
          handleAuthFromEnvelope(handleAuthError, payload),
      });
      return data;
    },
    onSuccess: () => {
      // Invalidate credit balance and stats after consuming credits
      queryClient.invalidateQueries({
        queryKey: creditsKeys.balance(),
      });
      queryClient.invalidateQueries({
        queryKey: creditsKeys.stats(),
      });
    },
  });
}

// Hook to fetch credit transactions with pagination, search, and sorting
export function useCreditTransactions(
  pageIndex: number,
  pageSize: number,
  search: string,
  sorting: SortingState
) {
  const handleAuthError = useAuthErrorHandler();

  return useQuery({
    queryKey: creditsKeys.transactionsList({
      pageIndex,
      pageSize,
      search,
      sorting,
    }),
    queryFn: async () => {
      const result = await getCreditTransactionsAction({
        pageIndex,
        pageSize,
        search,
        sorting,
      });

      const data = unwrapEnvelopeOrThrowDomainError<CreditTransactionsSuccess>(
        result?.data as Envelope<CreditTransactionsSuccess> | undefined,
        {
          defaultErrorMessage: 'Failed to fetch credit transactions',
          handleAuthEnvelope: (payload) =>
            handleAuthFromEnvelope(handleAuthError, payload),
        }
      );

      return {
        items: data.data?.items || [],
        total: data.data?.total || 0,
      };
    },
  });
}
