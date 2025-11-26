import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: (fn: unknown) => fn,
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { useAiErrorUi } from '../use-ai-error-ui';

describe('useAiErrorUi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses warning severity strategy for AI timeout codes', () => {
    const { handleAiError } = useAiErrorUi();

    handleAiError({
      code: 'AI_CONTENT_TIMEOUT',
      message: 'Timeout',
    });

    expect(toast.warning).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('uses error severity strategy for provider error', () => {
    const { handleAiError } = useAiErrorUi();

    handleAiError({
      code: 'AI_IMAGE_PROVIDER_ERROR',
      message: 'Provider failed',
    });

    expect(toast.error).toHaveBeenCalled();
  });

  it('falls back to error toast when no strategy is found', () => {
    const { handleAiError } = useAiErrorUi();

    handleAiError({
      code: 'SOME_UNKNOWN_CODE',
      message: 'Unknown error',
    });

    expect(toast.error).toHaveBeenCalled();
  });
});
