'use server';

import { getDb } from '@/db';
import { user } from '@/db/schema';
import { isDemoWebsite } from '@/lib/demo';
import { adminActionClient } from '@/lib/safe-action';
import { asc, desc, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

// Define the schema for getUsers parameters
const getUsersSchema = z.object({
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
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
  role: user.role,
  banned: user.banned,
  customerId: user.customerId,
  banReason: user.banReason,
  banExpires: user.banExpires,
} as const;

// Create a safe action for getting users
export const getUsersAction = adminActionClient
  .schema(getUsersSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { pageIndex, pageSize, search, sorting } = parsedInput;

      // search by name, email, and customerId
      const where = search
        ? or(
            ilike(user.name, `%${search}%`),
            ilike(user.email, `%${search}%`),
            ilike(user.customerId, `%${search}%`)
          )
        : undefined;

      const offset = pageIndex * pageSize;

      // Get the sort configuration
      const sortConfig = sorting[0];
      const sortField = sortConfig?.id
        ? sortFieldMap[sortConfig.id as keyof typeof sortFieldMap]
        : user.createdAt;
      const sortDirection = sortConfig?.desc ? desc : asc;

      const db = await getDb();
      let [items, [{ count }]] = await Promise.all([
        db
          .select()
          .from(user)
          .where(where)
          .orderBy(sortDirection(sortField))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: sql`count(*)` }).from(user).where(where),
      ]);

      // hide user data in demo website
      const isDemo = isDemoWebsite();
      if (isDemo) {
        items = items.map((item) => ({
          ...item,
          name: 'Demo User',
          email: 'example@mksaas.com',
          customerId: 'cus_abcdef123456',
        }));
      }

      return {
        success: true,
        data: {
          items,
          total: Number(count),
        },
      };
    } catch (error) {
      console.error('get users error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch users',
      };
    }
  });
