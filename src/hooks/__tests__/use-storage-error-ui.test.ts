import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toastMock } from '../../../tests/helpers/hooks';
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

    expect(toastMock.error).toHaveBeenCalled();
    expect(message).toContain('File size exceeds');
  });

  it('uses provided fallback when error is null', () => {
    const { handleStorageError } = useStorageErrorUi();

    const message = handleStorageError(null, 'Upload failed');

    expect(toastMock.error).toHaveBeenCalledWith('Upload failed');
    expect(message).toBe('Upload failed');
  });
});
