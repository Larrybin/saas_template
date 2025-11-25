import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import { getUsersAction } from '@/actions/get-users';
import {
  handleAuthFromEnvelope,
  useAuthErrorHandler,
} from '@/hooks/use-auth-error-handler';
import { authClient } from '@/lib/auth-client';
import type { User } from '@/lib/auth-types';
import {
  type EnvelopeWithDomainError,
  unwrapEnvelopeOrThrowDomainError,
} from '@/lib/domain-error-utils';

type Envelope<T> = EnvelopeWithDomainError<T>;

type AdminClient = {
  banUser: (params: {
    userId: string;
    banReason: string;
    banExpiresIn?: number;
  }) => Promise<unknown>;
  unbanUser: (params: { userId: string }) => Promise<unknown>;
};

// Query keys
export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'lists'] as const,
  list: (filters: {
    pageIndex: number;
    pageSize: number;
    search: string;
    sorting: SortingState;
  }) => [...usersKeys.lists(), filters] as const,
};

// Hook to fetch users with pagination, search, and sorting
export function useUsers(
  pageIndex: number,
  pageSize: number,
  search: string,
  sorting: SortingState
) {
  const handleAuthError = useAuthErrorHandler();

  return useQuery<{ items: User[]; total: number }>({
    queryKey: usersKeys.list({ pageIndex, pageSize, search, sorting }),
    queryFn: async () => {
      const result = await getUsersAction({
        pageIndex,
        pageSize,
        search,
        sorting,
      });

      const data = unwrapEnvelopeOrThrowDomainError<{
        success: true;
        data: { items: User[]; total: number };
      }>(
        result?.data as
          | Envelope<{ success: true; data: { items: User[]; total: number } }>
          | undefined,
        {
          defaultErrorMessage: 'Failed to fetch users',
          handleAuthEnvelope: (payload) =>
            handleAuthFromEnvelope(handleAuthError, payload),
        }
      );

      const items = (data.data?.items || []) as User[];
      const total = data.data?.total ?? 0;

      return {
        items,
        total,
      };
    },
  });
}

// Hook to ban user
export function useBanUser() {
  const queryClient = useQueryClient();
  const adminClient = (authClient as unknown as { admin: AdminClient }).admin;

  return useMutation({
    mutationFn: async ({
      userId,
      banReason,
      banExpiresIn,
    }: {
      userId: string;
      banReason: string;
      banExpiresIn?: number;
    }) => {
      const payload: {
        userId: string;
        banReason: string;
        banExpiresIn?: number;
      } =
        banExpiresIn !== undefined
          ? { userId, banReason, banExpiresIn }
          : { userId, banReason };

      return adminClient.banUser(payload);
    },
    onSuccess: () => {
      // Invalidate all users queries to refresh the data
      queryClient.invalidateQueries({
        queryKey: usersKeys.all,
      });
    },
  });
}

// Hook to unban user
export function useUnbanUser() {
  const queryClient = useQueryClient();
  const adminClient = (authClient as unknown as { admin: AdminClient }).admin;

  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) =>
      adminClient.unbanUser({ userId }),
    onSuccess: () => {
      // Invalidate all users queries to refresh the data
      queryClient.invalidateQueries({
        queryKey: usersKeys.all,
      });
    },
  });
}
