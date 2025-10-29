import { authClient } from '@/lib/auth-client';
import { useQuery } from '@tanstack/react-query';

// Query keys
export const userAccountsKeys = {
  all: ['userAccounts'] as const,
  list: (userId: string) => [...userAccountsKeys.all, 'list', userId] as const,
};

// Hook to fetch user accounts
export function useUserAccounts(userId: string | undefined) {
  return useQuery({
    queryKey: userAccountsKeys.list(userId || ''),
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const accounts = await authClient.listAccounts();

      // Check if the response is successful and contains accounts data
      if ('data' in accounts && Array.isArray(accounts.data)) {
        return accounts.data;
      }

      throw new Error('Failed to fetch user accounts');
    },
    enabled: !!userId,
  });
}

// Hook to check if user has credential provider
export function useHasCredentialProvider(userId: string | undefined) {
  const { data: accounts, isLoading, error } = useUserAccounts(userId);

  const hasCredentialProvider =
    accounts?.some((account) => account.provider === 'credential') ?? false;

  return {
    hasCredentialProvider,
    isLoading,
    error,
  };
}
