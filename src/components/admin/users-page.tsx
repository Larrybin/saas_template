'use client';

import { UsersTable } from '@/components/admin/users-table';
import { useUsers } from '@/hooks/use-users';
import type { SortingState } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import {
  parseAsIndex,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from 'nuqs';
import { useMemo } from 'react';

export function UsersPageClient() {
  const t = useTranslations('Dashboard.admin.users');

  const [{ page, pageSize, search, sortId, sortDesc }, setQueryStates] =
    useQueryStates({
      page: parseAsIndex.withDefault(0), // parseAsIndex adds +1 to URL, so 0-based internally, 1-based in URL
      pageSize: parseAsInteger.withDefault(10),
      search: parseAsString.withDefault(''),
      sortId: parseAsString.withDefault('createdAt'),
      sortDesc: parseAsInteger.withDefault(1),
    });

  const sorting: SortingState = useMemo(
    () => [{ id: sortId, desc: Boolean(sortDesc) }],
    [sortId, sortDesc]
  );

  // page is already 0-based internally thanks to parseAsIndex
  const { data, isLoading } = useUsers(page, pageSize, search, sorting);

  return (
    <UsersTable
      data={data?.items || []}
      total={data?.total || 0}
      pageIndex={page}
      pageSize={pageSize}
      search={search}
      sorting={sorting}
      loading={isLoading}
      onSearch={(newSearch) => setQueryStates({ search: newSearch, page: 0 })}
      onPageChange={(newPageIndex) => setQueryStates({ page: newPageIndex })}
      onPageSizeChange={(newPageSize) =>
        setQueryStates({ pageSize: newPageSize, page: 0 })
      }
      onSortingChange={(newSorting) => {
        if (newSorting.length > 0) {
          setQueryStates({
            sortId: newSorting[0].id,
            sortDesc: newSorting[0].desc ? 1 : 0,
          });
        }
      }}
    />
  );
}
