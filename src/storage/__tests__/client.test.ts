import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFileFromBrowser } from '../client';

describe('storage client - uploadFileFromBrowser', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses presigned URL when available and returns UploadFileResult', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'avatar.png', {
      type: 'image/png',
    });

    const presignPayload = {
      success: true as const,
      data: {
        uploadUrl: 'https://storage.example.com/presigned',
        method: 'PUT' as const,
        key: 'uploads/user_1/avatar.png',
        publicUrl: 'https://cdn.example.com/uploads/user_1/avatar.png',
      },
    };

    const presignResponse = new Response(JSON.stringify(presignPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const putResponse = new Response(null, { status: 200 });

    fetchMock
      .mockResolvedValueOnce(presignResponse)
      .mockResolvedValueOnce(putResponse);

    const result = await uploadFileFromBrowser(file, 'uploads/avatars');

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const presignCall = fetchMock.mock.calls[0];
    expect(presignCall[0]).toBe('/api/storage/presign');

    const presignBody = JSON.parse(
      (presignCall[1] as RequestInit).body as string
    ) as {
      filename: string;
      contentType: string;
      folder: string | null;
      size: number;
    };

    expect(presignBody).toMatchObject({
      filename: 'avatar.png',
      contentType: 'image/png',
      folder: 'uploads/avatars',
      size: file.size,
    });

    const putCall = fetchMock.mock.calls[1];
    expect(putCall[0]).toBe('https://storage.example.com/presigned');
    expect((putCall[1] as RequestInit).method).toBe('PUT');

    expect(result).toEqual({
      url: 'https://cdn.example.com/uploads/user_1/avatar.png',
      key: 'uploads/user_1/avatar.png',
    });
  });

  it('does not fallback when presign returns domain error for unsupported type', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'avatar.png', {
      type: 'image/png',
    });

    const presignPayload = {
      success: false as const,
      error: 'File type not supported',
      code: 'STORAGE_UNSUPPORTED_TYPE',
      retryable: false,
    };

    const presignResponse = new Response(JSON.stringify(presignPayload), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

    fetchMock.mockResolvedValueOnce(presignResponse);

    await expect(
      uploadFileFromBrowser(file, 'uploads/avatars')
    ).rejects.toMatchObject({
      code: 'STORAGE_UNSUPPORTED_TYPE',
      retryable: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to direct upload when presigned PUT fails with provider error', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'avatar.png', {
      type: 'image/png',
    });

    const presignPayload = {
      success: true as const,
      data: {
        uploadUrl: 'https://storage.example.com/presigned',
        method: 'PUT' as const,
        key: 'uploads/user_1/avatar.png',
        publicUrl: 'https://cdn.example.com/uploads/user_1/avatar.png',
      },
    };

    const presignResponse = new Response(JSON.stringify(presignPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const putResponse = new Response(null, { status: 500 });

    const uploadPayload = {
      success: true as const,
      data: {
        url: 'https://cdn.example.com/uploads/user_1/avatar.png',
        key: 'uploads/user_1/avatar.png',
      },
    };

    const uploadResponse = new Response(JSON.stringify(uploadPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    fetchMock
      .mockResolvedValueOnce(presignResponse)
      .mockResolvedValueOnce(putResponse)
      .mockResolvedValueOnce(uploadResponse);

    const result = await uploadFileFromBrowser(file, 'uploads/avatars');

    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/storage/presign');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://storage.example.com/presigned'
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/storage/upload');

    expect(result).toEqual({
      url: 'https://cdn.example.com/uploads/user_1/avatar.png',
      key: 'uploads/user_1/avatar.png',
    });
  });
});

