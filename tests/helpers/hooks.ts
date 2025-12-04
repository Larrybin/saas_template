import { vi } from 'vitest';

// Shared mocks for hook tests (React / i18n / routing / toast)

export const routerPushMock = vi.fn();

export const toastMock = {
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
};

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // In tests, keep useCallback behavior simple to avoid hook deps noise
    useCallback: (fn: unknown) => fn,
  };
});

vi.mock('next-intl', () => ({
  // Return key as-is to simplify assertions
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

vi.mock('@/i18n/navigation', () => ({
  useLocaleRouter: () => ({
    push: routerPushMock,
  }),
}));
