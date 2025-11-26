import { getErrorUiStrategy } from '@/lib/domain-error-ui-registry';
import type { DomainErrorLike } from '@/lib/domain-error-utils';
import { getDomainErrorMessage } from '@/lib/domain-error-utils';
import type { UploadFileResult } from './types';

const API_STORAGE_UPLOAD = '/api/storage/upload';

/**
 * Uploads a file from the browser to the storage provider
 * This function is meant to be used in client components
 *
 * Note: Since s3mini doesn't support presigned URLs, all uploads
 * go through the direct upload API endpoint regardless of file size.
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
    // With s3mini, we use direct upload for all file sizes
    // since presigned URLs are not supported
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder || '');

    const response = await fetch(API_STORAGE_UPLOAD, {
      method: 'POST',
      body: formData,
    });

    const json = (await response.json()) as
      | { success: true; data: UploadFileResult }
      | ({
          success: false;
          error?: string;
          retryable?: boolean;
        } & DomainErrorLike);

    if (!json.success) {
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
      throw domainError;
    }

    if (!response.ok) {
      throw new Error('Failed to upload file');
    }

    return json.data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error occurred during file upload');
  }
};
