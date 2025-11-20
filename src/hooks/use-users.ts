import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import { getUsersAction } from '@/actions/get-users';
import { authClient } from '@/lib/auth-client';
import type { User } from '@/lib/auth-types';

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
  return useQuery<{ items: User[]; total: number }>({
    queryKey: usersKeys.list({ pageIndex, pageSize, search, sorting }),
    queryFn: async () => {
      const result = await getUsersAction({
        pageIndex,
        pageSize,
        search,
        sorting,
      });

      if (!result?.data?.success) {
        throw new Error(result?.data?.error || 'Failed to fetch users');
      }

      const items = (result.data.data?.items || []) as User[];
      const total = result.data.data?.total ?? 0;

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
      return adminClient.banUser({
        userId,
        banReason,
        banExpiresIn,
      });
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
