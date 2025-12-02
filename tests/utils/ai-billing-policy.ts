import { getAiBillingPolicy, setAiBillingPolicy } from '@/ai/billing-config';
import type { AiBillingPolicy } from '@/ai/billing-policy';

/**
 * 在测试中临时替换全局 AI 计费策略（AiBillingPolicy）。
 *
 * 注意：
 * - 通过修改模块级单例实现，仅适用于串行执行的测试。
 * - 如果未来启用 Vitest 多 worker 并发，需要确保依赖它的测试 suite 串行运行，
 *   或改用可注入的策略 provider / mocking 方案。
 */
export async function withTestAiBillingPolicy<T>(
  policy: AiBillingPolicy,
  fn: () => Promise<T> | T
): Promise<T> {
  const original = getAiBillingPolicy();
  try {
    setAiBillingPolicy(policy);
    return await fn();
  } finally {
    setAiBillingPolicy(original);
  }
}
