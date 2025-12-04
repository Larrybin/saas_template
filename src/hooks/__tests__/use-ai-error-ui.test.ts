import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toastMock } from '../../../tests/helpers/hooks';
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

    expect(toastMock.warning).toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('uses error severity strategy for provider error', () => {
    const { handleAiError } = useAiErrorUi();

    handleAiError({
      code: 'AI_IMAGE_PROVIDER_ERROR',
      message: 'Provider failed',
    });

    expect(toastMock.error).toHaveBeenCalled();
  });

  it('falls back to error toast when no strategy is found', () => {
    const { handleAiError } = useAiErrorUi();

    handleAiError({
      code: 'SOME_UNKNOWN_CODE',
      message: 'Unknown error',
    });

    expect(toastMock.error).toHaveBeenCalled();
  });
});
