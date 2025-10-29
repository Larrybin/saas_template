'use server';

import { getDb } from '@/db';
import { creditTransaction } from '@/db/schema';
import type { User } from '@/lib/auth-types';
import { userActionClient } from '@/lib/safe-action';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

// Define the schema for getCreditTransactions parameters
const getCreditTransactionsSchema = z.object({
  pageIndex: z.number().min(0).default(0),
  pageSize: z.number().min(1).max(100).default(10),
  search: z.string().optional().default(''),
  sorting: z
    .array(
      z.object({
        id: z.string(),
        desc: z.boolean(),
      })
    )
    .optional()
    .default([]),
});

// Define sort field mapping
const sortFieldMap = {
  type: creditTransaction.type,
  amount: creditTransaction.amount,
  remainingAmount: creditTransaction.remainingAmount,
  description: creditTransaction.description,
  createdAt: creditTransaction.createdAt,
  updatedAt: creditTransaction.updatedAt,
  expirationDate: creditTransaction.expirationDate,
  expirationDateProcessedAt: creditTransaction.expirationDateProcessedAt,
  paymentId: creditTransaction.paymentId,
} as const;

// Create a safe action for getting credit transactions
export const getCreditTransactionsAction = userActionClient
  .schema(getCreditTransactionsSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const { pageIndex, pageSize, search, sorting } = parsedInput;
      const currentUser = (ctx as { user: User }).user;

      // Search logic: text fields use ilike, and if search is a number, also search amount fields
      const searchConditions = [];
      if (search) {
        // Always search text fields
        searchConditions.push(
          ilike(creditTransaction.type, `%${search}%`),
          ilike(creditTransaction.paymentId, `%${search}%`),
          ilike(creditTransaction.description, `%${search}%`)
        );

        // If search is a valid number, also search numeric fields
        const numericSearch = Number.parseInt(search, 10);
        if (!Number.isNaN(numericSearch)) {
          searchConditions.push(
            eq(creditTransaction.amount, numericSearch),
            eq(creditTransaction.remainingAmount, numericSearch)
          );
        }
      }

      const where = search
        ? and(
            eq(creditTransaction.userId, currentUser.id),
            or(...searchConditions)
          )
        : eq(creditTransaction.userId, currentUser.id);

      const offset = pageIndex * pageSize;

      // Get the sort configuration
      const sortConfig = sorting[0];
      const sortField = sortConfig?.id
        ? sortFieldMap[sortConfig.id as keyof typeof sortFieldMap]
        : creditTransaction.createdAt;
      const sortDirection = sortConfig?.desc ? desc : asc;

      const db = await getDb();
      const [items, [{ count }]] = await Promise.all([
        db
          .select({
            id: creditTransaction.id,
            userId: creditTransaction.userId,
            type: creditTransaction.type,
            description: creditTransaction.description,
            amount: creditTransaction.amount,
            remainingAmount: creditTransaction.remainingAmount,
            paymentId: creditTransaction.paymentId,
            expirationDate: creditTransaction.expirationDate,
            expirationDateProcessedAt:
              creditTransaction.expirationDateProcessedAt,
            createdAt: creditTransaction.createdAt,
            updatedAt: creditTransaction.updatedAt,
          })
          .from(creditTransaction)
          .where(where)
          .orderBy(sortDirection(sortField))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql`count(*)` })
          .from(creditTransaction)
          .where(where),
      ]);

      return {
        success: true,
        data: {
          items,
          total: Number(count),
        },
      };
    } catch (error) {
      console.error('get credit transactions error:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch credit transactions',
      };
    }
  });
