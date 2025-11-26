import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: (fn: unknown) => fn,
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { useStorageErrorUi } from '../use-storage-error-ui';

describe('useStorageErrorUi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses strategy fallback message for known storage code', () => {
    const { handleStorageError } = useStorageErrorUi();

    const message = handleStorageError({
      code: 'STORAGE_FILE_TOO_LARGE',
      message: undefined,
    });

    expect(toast.error).toHaveBeenCalled();
    expect(message).toContain('File size exceeds');
  });

  it('uses provided fallback when error is null', () => {
    const { handleStorageError } = useStorageErrorUi();

    const message = handleStorageError(null, 'Upload failed');

    expect(toast.error).toHaveBeenCalledWith('Upload failed');
    expect(message).toBe('Upload failed');
  });
});
