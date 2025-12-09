import { type NextRequest, NextResponse } from 'next/server';
import { ensureApiUser } from '@/lib/server/api-auth';
import { ErrorCodes } from '@/lib/server/error-codes';
import { createLoggerFromHeaders, resolveRequestId } from '@/lib/server/logger';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { uploadFile } from '@/storage';
import { resolveTargetFolder } from '@/storage/folder';
import { StorageError } from '@/storage/types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const IMAGE_TYPE_VALIDATORS: Record<string, (buffer: Buffer) => boolean> = {
  'image/png': (buffer) => {
    const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buffer.length < pngMagic.length) return false;
    return pngMagic.every((byte, index) => buffer[index] === byte);
  },
  'image/jpeg': (buffer) => {
    // JPEG files start with FF D8 FF and end with FF D9; we only check the header here.
    if (buffer.length < 3) return false;
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  },
  'image/webp': (buffer) => {
    // WebP is RIFF-based: \"RIFF\"....\"WEBP\"
    if (buffer.length < 12) return false;
    const riff = buffer.toString('ascii', 0, 4);
    const webp = buffer.toString('ascii', 8, 12);
    return riff === 'RIFF' && webp === 'WEBP';
  },
};

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers);
  const logger = createLoggerFromHeaders(request.headers, {
    route: '/api/storage/upload',
    span: 'api.storage.upload',
    requestId,
  });

  const authResult = await ensureApiUser(request);
  if (!authResult.ok) {
    logger.warn('Unauthorized storage upload request');
    return authResult.response;
  }

  const rateLimitResult = await enforceRateLimit({
    request,
    scope: 'storage-upload',
    limit: 5,
    window: '1 m',
    userId: authResult.user.id,
  });

  if (!rateLimitResult.ok) {
    logger.warn(
      { userId: authResult.user.id },
      'Storage upload rate limit exceeded'
    );
    return rateLimitResult.response;
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    logger.warn('Rejected upload: unsupported content type', { contentType });
    return NextResponse.json(
      {
        success: false,
        error: 'Content-Type must be multipart/form-data',
        code: ErrorCodes.StorageInvalidContentType,
        retryable: false,
      },
      { status: 400 }
    );
  }

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
          code: ErrorCodes.StorageNoFile,
          retryable: false,
        },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > MAX_FILE_SIZE) {
      logger.warn('Upload failed: file size exceeds limit', {
        size: file.size,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'File size exceeds the 10MB limit',
          code: ErrorCodes.StorageFileTooLarge,
          retryable: false,
        },
        { status: 400 }
      );
    }

    // Validate file type using the shared validator map
    const validator = IMAGE_TYPE_VALIDATORS[file.type];
    if (!validator) {
      logger.warn('Upload failed: unsupported file type', {
        type: file.type,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'File type not supported',
          code: ErrorCodes.StorageUnsupportedType,
          retryable: false,
        },
        { status: 400 }
      );
    }

    const resolvedFolder = resolveTargetFolder(folder, authResult.user.id);
    if (!resolvedFolder.ok) {
      logger.warn(
        { folder, userId: authResult.user.id },
        'Upload failed: invalid folder'
      );
      return NextResponse.json(
        {
          success: false,
          error: resolvedFolder.error,
          code: ErrorCodes.StorageInvalidFolder,
          retryable: false,
        },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Basic magic number validation for supported image types
    if (!validator(buffer)) {
      logger.warn('Upload failed: file magic number does not match type', {
        type: file.type,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'File type not supported',
          code: ErrorCodes.StorageUnsupportedType,
          retryable: false,
        },
        { status: 400 }
      );
    }

    // Upload to storage
    const result = await uploadFile(
      buffer,
      file.name,
      file.type,
      resolvedFolder.folder
    );

    logger.info(
      {
        fileName: file.name,
        size: file.size,
        folder: resolvedFolder.folder,
        userId: authResult.user.id,
      },
      'uploadFile, result'
    );
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
          code: ErrorCodes.StorageProviderError,
          retryable: true,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Something went wrong while uploading the file',
        code: ErrorCodes.StorageUnknownError,
        retryable: true,
      },
      { status: 500 }
    );
  }
}
