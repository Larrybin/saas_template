import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { getCurrentPeriodKey } from '@/credits/utils/period-key';
import { getDb } from '@/db';
import { aiUsage } from '@/db/schema';

const AI_USAGE_FEATURES = {
  chat: 'chat',
  analyzeContent: 'analyze-content',
  generateImage: 'generate-image',
} as const;

export type AiUsageFeature =
  (typeof AI_USAGE_FEATURES)[keyof typeof AI_USAGE_FEATURES];

export const AI_USAGE_FEATURE = AI_USAGE_FEATURES;

/**
 * 增加一次调用计数，并返回当前调用是否落在免费额度内。
 *
 * 使用 INSERT ... ON CONFLICT DO UPDATE + RETURNING 实现原子自增，避免并发下重复免费。
 * 返回 true 表示自增后的 usedCalls 仍在免费额度内（<= freeCallsPerPeriod），否则返回 false。
 */
export async function incrementAiUsageAndCheckWithinFreeQuota(input: {
  userId: string;
  feature: AiUsageFeature;
  freeCallsPerPeriod: number;
  now?: Date;
}): Promise<boolean> {
  const { userId, feature, freeCallsPerPeriod, now = new Date() } = input;
  if (freeCallsPerPeriod <= 0) {
    return false;
  }

  const db = await getDb();
  const periodKey = getCurrentPeriodKey(now);

  const [row] = await db
    .insert(aiUsage)
    .values({
      id: randomUUID(),
      userId,
      feature,
      periodKey,
      usedCalls: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [aiUsage.userId, aiUsage.feature, aiUsage.periodKey],
      set: {
        usedCalls: sql`${aiUsage.usedCalls} + 1`,
        updatedAt: now,
      },
    })
    .returning({
      usedCalls: aiUsage.usedCalls,
    });

  return (row?.usedCalls ?? 0) <= freeCallsPerPeriod;
}

