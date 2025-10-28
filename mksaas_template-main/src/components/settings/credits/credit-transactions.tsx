'use client';

import { CreditTransactionsTable } from '@/components/settings/credits/credit-transactions-table';
import { useCreditTransactions } from '@/hooks/use-credits';
import type { SortingState } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import {
  parseAsIndex,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from 'nuqs';
import { useMemo } from 'react';

/**
 * Credit transactions component
 */
export function CreditTransactions() {
  const t = useTranslations('Dashboard.settings.credits.transactions');

  const [{ page, pageSize, search, sortId, sortDesc }, setQueryStates] =
    useQueryStates({
      page: parseAsIndex.withDefault(0), // 0-based internally, 1-based in URL
      pageSize: parseAsInteger.withDefault(10),
      search: parseAsString.withDefault(''),
      sortId: parseAsString.withDefault('createdAt'),
      sortDesc: parseAsInteger.withDefault(1),
    });

  const sorting: SortingState = useMemo(
    () => [{ id: sortId, desc: Boolean(sortDesc) }],
    [sortId, sortDesc]
  );

  const { data, isLoading } = useCreditTransactions(
    page,
    pageSize,
    search,
    sorting
  );

  return (
    <CreditTransactionsTable
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
