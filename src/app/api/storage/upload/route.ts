import { type NextRequest, NextResponse } from 'next/server';
import { createLoggerFromHeaders } from '@/lib/server/logger';
import { uploadFile } from '@/storage';
import { StorageError } from '@/storage/types';

export async function POST(request: NextRequest) {
  const logger = createLoggerFromHeaders(request.headers, {
    route: '/api/storage/upload',
    span: 'storage.upload',
  });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = formData.get('folder') as string | null;

    if (!file) {
      logger.warn('Upload failed: no file provided');
      return NextResponse.json(
        {
          success: false,
          error: 'No file provided',
          code: 'STORAGE_NO_FILE',
          retryable: false,
        },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      logger.warn('Upload failed: file size exceeds limit', {
        size: file.size,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'File size exceeds the 10MB limit',
          code: 'STORAGE_FILE_TOO_LARGE',
          retryable: false,
        },
        { status: 400 }
      );
    }

    // Validate file type (optional, based on your requirements)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      logger.warn('Upload failed: unsupported file type', {
        type: file.type,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'File type not supported',
          code: 'STORAGE_UNSUPPORTED_TYPE',
          retryable: false,
        },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to storage
    const result = await uploadFile(
      buffer,
      file.name,
      file.type,
      folder || undefined
    );

    logger.info({ fileName: file.name }, 'uploadFile, result');
    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error({ error }, 'Error uploading file');

    if (error instanceof StorageError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: 'STORAGE_PROVIDER_ERROR',
          retryable: true,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Something went wrong while uploading the file',
        code: 'STORAGE_UNKNOWN_ERROR',
        retryable: true,
      },
      { status: 500 }
    );
  }
}
