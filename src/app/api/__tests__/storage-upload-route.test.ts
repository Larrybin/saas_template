import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '@/lib/server/error-codes';
import { StorageError } from '@/storage/types';
import {
  enforceRateLimitMock,
  ensureApiUserMock,
  setupApiAuthAndRateLimit,
} from '../../../../tests/helpers/api';

vi.mock('@/lib/server/api-auth', () => ({
  ensureApiUser: (...args: unknown[]) => ensureApiUserMock(...args),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
}));

// Import route handler after shared auth + rate-limit mocks so vi.mock executes first.
import { POST as storageUploadPost } from '@/app/api/storage/upload/route';

const uploadFileMock = vi.fn();

vi.mock('@/storage', () => ({
  uploadFile: (...args: unknown[]) => uploadFileMock(...args),
}));

type MultipartOptions = {
  file?: { name: string; type: string; size: number };
  folder?: string | null;
};

function createMultipartRequest(
  _url: string,
  options: MultipartOptions
): Request {
  const form = new FormData();

  if (options.file) {
    const { name, type, size } = options.file;
    let blob: Blob;

    if (type === 'image/png') {
      // Minimal valid PNG header followed by padding to reach the desired size.
      const pngHeader = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const paddingSize = Math.max(size - pngHeader.length, 0);
      const padding = new Uint8Array(paddingSize);
      blob = new Blob([pngHeader, padding], { type });
    } else {
      blob = new Blob(['x'.repeat(size)], { type });
    }

    const file = new File([blob], name, { type });
    form.set('file', file);
  }

  if (options.folder !== undefined) {
    form.set('folder', options.folder ?? '');
  }

  return {
    headers: new Headers({
      'content-type': 'multipart/form-data',
    }),
    async formData() {
      return form;
    },
  } as Partial<Request> as Request;
}

describe('/api/storage/upload route', () => {
  const baseUrl = 'http://localhost/api/storage/upload';

  beforeEach(() => {
    vi.clearAllMocks();

    setupApiAuthAndRateLimit('user_1');

    uploadFileMock.mockResolvedValue({
      url: 'https://cdn.example.com/uploads/user_1/file.png',
      path: 'uploads/user_1/file.png',
    });
  });

  it('rejects non multipart/form-data content type', async () => {
    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await storageUploadPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.StorageInvalidContentType);
    expect(json.retryable).toBe(false);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('returns error envelope when no file is provided', async () => {
    const req = createMultipartRequest(baseUrl, {});

    const res = await storageUploadPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.StorageNoFile);
    expect(json.retryable).toBe(false);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('returns error envelope when file size exceeds limit', async () => {
    const req = createMultipartRequest(baseUrl, {
      file: {
        name: 'large.png',
        type: 'image/png',
        size: 11 * 1024 * 1024,
      },
    });

    const res = await storageUploadPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.StorageFileTooLarge);
    expect(json.retryable).toBe(false);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('returns error envelope when file type is not supported', async () => {
    const req = createMultipartRequest(baseUrl, {
      file: {
        name: 'file.txt',
        type: 'text/plain',
        size: 1024,
      },
    });

    const res = await storageUploadPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.StorageUnsupportedType);
    expect(json.retryable).toBe(false);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('returns error envelope when folder is invalid', async () => {
    const req = createMultipartRequest(baseUrl, {
      file: {
        name: 'avatar.png',
        type: 'image/png',
        size: 1024,
      },
      folder: '../secret',
    });

    const res = await storageUploadPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.StorageInvalidFolder);
    expect(json.retryable).toBe(false);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('uploads file successfully with normalized folder and returns envelope', async () => {
    const req = createMultipartRequest(baseUrl, {
      file: {
        name: 'avatar.png',
        type: 'image/png',
        size: 1024,
      },
      folder: 'uploads/avatars',
    });

    const res = await storageUploadPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      data?: { url: string; path: string };
    };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      url: 'https://cdn.example.com/uploads/user_1/file.png',
      path: 'uploads/user_1/file.png',
    });
    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      'avatar.png',
      'image/png',
      expect.stringContaining('uploads')
    );
  });

  it('returns provider error envelope when storage throws StorageError', async () => {
    uploadFileMock.mockRejectedValueOnce(
      new StorageError('provider error in test')
    );

    const req = createMultipartRequest(baseUrl, {
      file: {
        name: 'avatar.png',
        type: 'image/png',
        size: 1024,
      },
      folder: 'uploads',
    });

    const res = await storageUploadPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.StorageProviderError);
    expect(json.retryable).toBe(true);
  });

  it('returns unknown error envelope when unexpected error is thrown', async () => {
    uploadFileMock.mockRejectedValueOnce(new Error('unexpected'));

    const req = createMultipartRequest(baseUrl, {
      file: {
        name: 'avatar.png',
        type: 'image/png',
        size: 1024,
      },
      folder: 'uploads',
    });

    const res = await storageUploadPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.StorageUnknownError);
    expect(json.retryable).toBe(true);
  });
});
