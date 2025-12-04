import { randomUUID } from 'node:crypto';

import dotenv from 'dotenv';
import { and, eq, inArray } from 'drizzle-orm';

import { websiteConfig } from '../src/config/website.js';
import { getDb } from '../src/db/index.js';
import { payment, userLifetimeMembership } from '../src/db/schema.js';
import type { PricePlan } from '../src/payment/types.js';

dotenv.config();

async function main() {
  const db = await getDb();

  // 运行时对配置保持一定容忍度：
  // - 忽略 null/undefined 或非完整 PricePlan 的条目；
  // - 仅针对 isLifetime === true 的计划生成 backfill 数据。
  const lifetimePlans = Object.values(websiteConfig.price.plans ?? {}).filter(
    (plan): plan is PricePlan =>
      !!plan && (plan as PricePlan).isLifetime === true
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
      })
      .returning({ id: userLifetimeMembership.id });

    if (result.length > 0) {
      inserted += 1;
    }
  }

  console.log(`Backfill completed. Inserted ${inserted} membership(s).`);
}

main().catch((error) => {
  console.error('Failed to backfill lifetime memberships:', error);
  process.exit(1);
});
