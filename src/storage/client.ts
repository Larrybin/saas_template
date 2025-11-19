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

    if (!response.ok) {
      const error = (await response.json()) as { message: string };
      throw new Error(error.message || 'Failed to upload file');
    }

    return await response.json();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error occurred during file upload';
    throw new Error(message);
  }
};
