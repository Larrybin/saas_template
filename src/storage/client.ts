import { getErrorUiStrategy } from '@/lib/domain-error-ui-registry';
import type { DomainErrorLike } from '@/lib/domain-error-utils';
import { getDomainErrorMessage } from '@/lib/domain-error-utils';
import type { UploadFileResult } from './types';

const API_STORAGE_UPLOAD = '/api/storage/upload';
const API_STORAGE_PRESIGN = '/api/storage/presign';

type StorageErrorResponse = {
  success: false;
  error?: string;
  code?: string;
  retryable?: boolean;
};

type StorageSuccessResponse<T> = {
  success: true;
  data: T;
};

type StorageResponse<T> = StorageSuccessResponse<T> | StorageErrorResponse;

function asDomainErrorFromStorageJson(json: StorageErrorResponse): Error &
  DomainErrorLike {
  const { code, error, retryable } = json;
  const strategy = getErrorUiStrategy(code);
  const fallback =
    error ?? strategy?.defaultFallbackMessage ?? 'Failed to upload file';
  const errorMessage = getDomainErrorMessage(code, undefined, fallback);
  const domainError = new Error(errorMessage) as Error & DomainErrorLike;
  if (typeof code === 'string') {
    domainError.code = code;
  }
  if (typeof retryable === 'boolean') {
    domainError.retryable = retryable;
  }
  return domainError;
}

const uploadViaDirectApi = async (
  file: File,
  folder?: string
): Promise<UploadFileResult> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder || '');

  const response = await fetch(API_STORAGE_UPLOAD, {
    method: 'POST',
    body: formData,
  });

  const json = (await response.json()) as StorageResponse<UploadFileResult>;

  if (!json.success) {
    throw asDomainErrorFromStorageJson(json);
  }

  if (!response.ok) {
    throw new Error('Failed to upload file');
  }

  return json.data;
};

const uploadViaPresignedUrl = async (
  file: File,
  folder?: string
): Promise<UploadFileResult> => {
  const presignResponse = await fetch(API_STORAGE_PRESIGN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      folder: folder ?? null,
      size: file.size,
    }),
  });

  const json = (await presignResponse.json()) as StorageResponse<{
    uploadUrl: string;
    method: 'PUT';
    key: string;
    publicUrl: string;
  }>;

  if (!json.success) {
    throw asDomainErrorFromStorageJson(json);
  }

  if (!presignResponse.ok) {
    throw new Error('Failed to obtain presigned upload URL');
  }

  const { uploadUrl, method, key, publicUrl } = json.data;

  const putResponse = await fetch(uploadUrl, {
    method,
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!putResponse.ok) {
    const domainError = new Error(
      'Failed to upload file to storage provider'
    ) as Error & DomainErrorLike;
    domainError.code = 'STORAGE_PROVIDER_ERROR';
    domainError.retryable = true;
    throw domainError;
  }

  return {
    url: publicUrl,
    key,
  };
};

const shouldFallbackToDirectUpload = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const maybeDomainError = error as Error & Partial<DomainErrorLike>;
  const code = maybeDomainError.code;

  if (typeof code !== 'string') {
    return false;
  }

  if (code === 'STORAGE_PROVIDER_ERROR' || code === 'STORAGE_UNKNOWN_ERROR') {
    return true;
  }

  return false;
};

/**
 * Uploads a file from the browser to the storage provider.
 * This function is meant to be used in client components.
 *
 * 优先使用预签名直传；当存储提供方错误时回退到直传 API，
 * 对调用方保持 UploadFileResult 语义不变。
 *
 * @param file - The file object from an input element
 * @param folder - Optional folder path to store the file in
 * @returns Promise with the URL of the uploaded file
 */
export const uploadFileFromBrowser = async (
  file: File,
  folder?: string
): Promise<UploadFileResult> => {
  try {
    return await uploadViaPresignedUrl(file, folder);
  } catch (error) {
    if (shouldFallbackToDirectUpload(error)) {
      return uploadViaDirectApi(file, folder);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Unknown error occurred during file upload');
  }
};
