import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '@/lib/server/error-codes';
import { ConfigurationError, StorageError } from '@/storage/types';
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

const getStorageProviderMock = vi.fn();
const createPresignedUploadUrlMock = vi.fn();

vi.mock('@/storage', () => ({
  getStorageProvider: (...args: unknown[]) => getStorageProviderMock(...args),
}));

// Import route handler after shared mocks so vi.mock executes first.
import { POST as storagePresignPost } from '@/app/api/storage/presign/route';

describe('/api/storage/presign route', () => {
  const baseUrl = 'http://localhost/api/storage/presign';

  beforeEach(() => {
    vi.clearAllMocks();

    setupApiAuthAndRateLimit('user_1');

    getStorageProviderMock.mockReturnValue({
      createPresignedUploadUrl: (...args: unknown[]) =>
        createPresignedUploadUrlMock(...args),
    });

    createPresignedUploadUrlMock.mockResolvedValue({
      uploadUrl: 'https://storage.example.com/presigned',
      method: 'PUT',
      publicUrl: 'https://cdn.example.com/uploads/user_1/avatar.png',
    });
  });

  it('returns error envelope when JSON body is invalid', async () => {
    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    });

    const res = await storagePresignPost(req as never);
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
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns error envelope when filename is missing', async () => {
    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentType: 'image/png',
        folder: 'uploads/avatars',
        size: 1024,
      }),
    });

    const res = await storagePresignPost(req as never);
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
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns error envelope when contentType is missing', async () => {
    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'avatar.png',
        folder: 'uploads/avatars',
        size: 1024,
      }),
    });

    const res = await storagePresignPost(req as never);
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
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns error envelope when file size exceeds limit', async () => {
    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'large.png',
        contentType: 'image/png',
        folder: 'uploads/avatars',
        size: 11 * 1024 * 1024,
      }),
    });

    const res = await storagePresignPost(req as never);
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
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns error envelope when content type is not an image', async () => {
    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'file.pdf',
        contentType: 'application/pdf',
        folder: 'uploads/avatars',
        size: 1024,
      }),
    });

    const res = await storagePresignPost(req as never);
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
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns error envelope when folder is invalid', async () => {
    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'avatar.png',
        contentType: 'image/png',
        folder: '../secret',
        size: 1024,
      }),
    });

    const res = await storagePresignPost(req as never);
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
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns error envelope when provider does not support presigned URLs', async () => {
    getStorageProviderMock.mockReturnValueOnce({});

    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'avatar.png',
        contentType: 'image/png',
        folder: 'uploads/avatars',
        size: 1024,
      }),
    });

    const res = await storagePresignPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe(ErrorCodes.StorageProviderError);
    expect(json.retryable).toBe(false);
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('generates presigned URL successfully and returns envelope', async () => {
    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'avatar.png',
        contentType: 'image/png',
        folder: 'uploads/avatars',
        size: 1024,
      }),
    });

    const res = await storagePresignPost(req as never);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        uploadUrl: string;
        method: string;
        key: string;
        publicUrl: string;
      };
    };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(json?.data?.uploadUrl).toBe(
      'https://storage.example.com/presigned'
    );
    expect(json?.data?.publicUrl).toBe(
      'https://cdn.example.com/uploads/user_1/avatar.png'
    );
    expect(json?.data?.method).toBe('PUT');
    expect(json?.data?.key).toMatch(/\.png$/);

    expect(createPresignedUploadUrlMock).toHaveBeenCalledTimes(1);
    expect(createPresignedUploadUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/uploads/),
        contentType: 'image/png',
        expiresInSeconds: 900,
      })
    );
  });

  it('returns provider error envelope when storage throws ConfigurationError', async () => {
    createPresignedUploadUrlMock.mockRejectedValueOnce(
      new ConfigurationError('bad storage config for test')
    );

    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'avatar.png',
        contentType: 'image/png',
        folder: 'uploads/avatars',
        size: 1024,
      }),
    });

    const res = await storagePresignPost(req as never);
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

  it('returns provider error envelope when storage throws StorageError', async () => {
    createPresignedUploadUrlMock.mockRejectedValueOnce(
      new StorageError('provider error in test')
    );

    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'avatar.png',
        contentType: 'image/png',
        folder: 'uploads/avatars',
        size: 1024,
      }),
    });

    const res = await storagePresignPost(req as never);
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
    createPresignedUploadUrlMock.mockRejectedValueOnce(new Error('unexpected'));

    const req = new Request(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'avatar.png',
        contentType: 'image/png',
        folder: 'uploads/avatars',
        size: 1024,
      }),
    });

    const res = await storagePresignPost(req as never);
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

