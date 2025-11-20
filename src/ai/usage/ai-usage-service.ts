import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
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
 * - 若当前周期内 usedCalls < freeCallsPerPeriod，会自增 usedCalls 并返回 true（本次免费）。
 * - 若已达到或超过 freeCallsPerPeriod，返回 false（调用方应继续走积分扣费）。
 *
 * 注意：当前实现使用「读后更新」模式，并非强事务计数，极端并发下可能存在少量超额免费调用。
 * 如需更严格控制，可改为使用数据库级别的原子 upsert/increment。
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

  const existing = await db
    .select()
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.feature, feature),
        eq(aiUsage.periodKey, periodKey)
      )
    )
    .limit(1);

  const record = existing[0];
  const currentUsed = record?.usedCalls ?? 0;

  // 免费额度已用完
  if (currentUsed >= freeCallsPerPeriod) {
    return false;
  }

  const newUsed = currentUsed + 1;

  if (record) {
    await db
      .update(aiUsage)
      .set({ usedCalls: newUsed, updatedAt: now })
      .where(eq(aiUsage.id, record.id));
  } else {
    await db.insert(aiUsage).values({
      id: randomUUID(),
      userId,
      feature,
      periodKey,
      usedCalls: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  return true;
}
