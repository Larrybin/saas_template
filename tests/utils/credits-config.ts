import { websiteConfig } from '@/config/website';

type CreditsConfig = typeof websiteConfig.credits;

/**
 * 在测试中临时覆盖 websiteConfig.credits。
 *
 * 注意：该 helper 通过修改全局配置实现，只适用于串行执行的测试。
 * 如果未来开启 Vitest 多 worker 并发，需要确保依赖它的测试 suite 以串行方式运行，
 * 或改为通过可注入的配置 provider/mocking 方案来替代直接写全局对象。
 */
export async function withTestCreditsConfig<T>(
  overrides: Partial<NonNullable<CreditsConfig>>,
  fn: () => Promise<T> | T
): Promise<T> {
  const original = websiteConfig.credits;
  // merge overrides on top of existing credits config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (websiteConfig as any).credits = { ...(original ?? {}), ...overrides };
  try {
    return await fn();
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (websiteConfig as any).credits = original;
  }
}
