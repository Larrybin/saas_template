import { addDays } from 'date-fns';
import { and, eq, gt, gte, isNotNull, lte, sum } from 'drizzle-orm';
import { getDb } from '@/db';
import { creditTransaction } from '@/db/schema';
import { CREDITS_EXPIRATION_DAYS } from '@/lib/constants';

export async function getUserExpiringCreditsAmount(
  userId: string
): Promise<number> {
  const db = await getDb();
  const now = new Date();
  const expirationDaysFromNow = addDays(now, CREDITS_EXPIRATION_DAYS);

  const expiringCreditsResult = await db
    .select({
      totalAmount: sum(creditTransaction.remainingAmount),
    })
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        isNotNull(creditTransaction.expirationDate),
        isNotNull(creditTransaction.remainingAmount),
        gt(creditTransaction.remainingAmount, 0),
        lte(creditTransaction.expirationDate, expirationDaysFromNow),
        gte(creditTransaction.expirationDate, now)
      )
    );

  return Number(expiringCreditsResult[0]?.totalAmount) || 0;
}
