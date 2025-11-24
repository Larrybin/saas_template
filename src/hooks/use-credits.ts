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
  type DomainErrorLike,
  getDomainErrorMessage,
} from '@/lib/domain-error-utils';

type CreditBalanceSuccess = { success: true; credits: number };
type CreditBalanceError = { success: false; error?: string } & DomainErrorLike;
type CreditBalanceData = CreditBalanceSuccess | CreditBalanceError;

type CreditStatsSuccess = {
  success: true;
  data: {
    expiringCredits: {
      amount: number;
    };
  };
};
type CreditStatsError = { success: false; error?: string } & DomainErrorLike;
type CreditStatsData = CreditStatsSuccess | CreditStatsError;

type CreditTransactionsSuccess = {
  success: true;
  data: {
    items: CreditTransaction[];
    total: number;
  };
};
type CreditTransactionsError = {
  success: false;
  error?: string;
} & DomainErrorLike;
type CreditTransactionsData =
  | CreditTransactionsSuccess
  | CreditTransactionsError;

type AuthErrorHandler = ReturnType<typeof useAuthErrorHandler>;

function unwrapCreditBalance(
  data: CreditBalanceData | undefined,
  handleAuthError: AuthErrorHandler
): CreditBalanceSuccess {
  if (!data) {
    throw new Error('Failed to fetch credit balance');
  }

  if (!data.success) {
    handleAuthFromEnvelope(handleAuthError, data);
    throw new Error(data.error || 'Failed to fetch credit balance');
  }

  return data;
}

function unwrapCreditStats(
  data: CreditStatsData | undefined,
  handleAuthError: AuthErrorHandler
): CreditStatsSuccess {
  if (!data) {
    throw new Error('Failed to fetch credit stats');
  }

  if (!data.success) {
    handleAuthFromEnvelope(handleAuthError, data);
    throw new Error(data.error || 'Failed to fetch credit stats');
  }

  return data;
}

function unwrapCreditTransactions(
  data: CreditTransactionsData | undefined,
  handleAuthError: AuthErrorHandler
): CreditTransactionsSuccess {
  if (!data) {
    throw new Error('Failed to fetch credit transactions');
  }

  if (!data.success) {
    handleAuthFromEnvelope(handleAuthError, data);
    throw new Error(data.error || 'Failed to fetch credit transactions');
  }

  return data;
}

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
      const data = unwrapCreditBalance(
        result?.data as CreditBalanceData | undefined,
        handleAuthError
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
      const data = unwrapCreditStats(
        result?.data as CreditStatsData | undefined,
        handleAuthError
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
      const data = result?.data as
        | ({ success?: boolean; error?: string } & DomainErrorLike)
        | undefined;
      if (!data?.success) {
        if (data?.code === 'AUTH_UNAUTHORIZED') {
          handleAuthError({ code: data.code, message: data.error });
        }

        const resolvedMessage =
          data?.error ?? getDomainErrorMessage(data?.code);
        const error = new Error(resolvedMessage) as Error & DomainErrorLike;
        if (typeof data?.code === 'string') {
          error.code = data.code;
        }
        if (typeof data?.retryable === 'boolean') {
          error.retryable = data.retryable;
        }
        throw error;
      }
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

      const data = unwrapCreditTransactions(
        result?.data as CreditTransactionsData | undefined,
        handleAuthError
      );

      return {
        items: data.data?.items || [],
        total: data.data?.total || 0,
      };
    },
  });
}
