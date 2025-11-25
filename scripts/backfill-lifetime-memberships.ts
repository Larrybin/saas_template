import { randomUUID } from 'node:crypto';

import dotenv from 'dotenv';
import { and, eq, inArray } from 'drizzle-orm';

import { websiteConfig } from '../src/config/website.js';
import { getDb } from '../src/db/index.js';
import { payment, userLifetimeMembership } from '../src/db/schema.js';

dotenv.config();

async function main() {
  const db = await getDb();

  const lifetimePlans = Object.values(websiteConfig.price.plans).filter(
    (plan) => plan?.isLifetime
  );

  const lifetimePriceIds = lifetimePlans.flatMap((plan) =>
    (plan.prices ?? []).map((price) => price.priceId).filter(Boolean)
  );

  if (lifetimePriceIds.length === 0) {
    console.log('No lifetime plans configured. Nothing to backfill.');
    return;
  }

  const payments = await db
    .select({
      userId: payment.userId,
      priceId: payment.priceId,
      periodStart: payment.periodStart,
    })
    .from(payment)
    .where(
      and(
        eq(payment.type, 'one_time'),
        eq(payment.status, 'completed'),
        inArray(payment.priceId, lifetimePriceIds)
      )
    );

  let inserted = 0;
  for (const record of payments) {
    const result = await db
      .insert(userLifetimeMembership)
      .values({
        id: randomUUID(),
        userId: record.userId,
        priceId: record.priceId,
        cycleRefDate: record.periodStart ?? new Date(),
      })
      .onConflictDoNothing({
        target: [userLifetimeMembership.userId, userLifetimeMembership.priceId],
      });

    if (result.rowCount && result.rowCount > 0) {
      inserted += 1;
    }
  }

  console.log(`Backfill completed. Inserted ${inserted} membership(s).`);
}

main().catch((error) => {
  console.error('Failed to backfill lifetime memberships:', error);
  process.exit(1);
});
