import { websiteConfig } from '@/config/website';

type CreditsConfig = typeof websiteConfig.credits;

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
