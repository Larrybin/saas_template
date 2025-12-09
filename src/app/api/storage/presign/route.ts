import { randomUUID } from 'crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { ensureApiUser } from '@/lib/server/api-auth';
import { ErrorCodes } from '@/lib/server/error-codes';
import { createLoggerFromHeaders, resolveRequestId } from '@/lib/server/logger';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { getStorageProvider } from '@/storage';
import { resolveTargetFolder } from '@/storage/folder';
import { ConfigurationError, StorageError } from '@/storage/types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB, aligned with upload route

type PresignRequestBody = {
  filename: string;
  contentType: string;
  folder?: string | null;
  size: number;
};

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers);
  const logger = createLoggerFromHeaders(request.headers, {
    route: '/api/storage/presign',
    span: 'api.storage.presign',
    requestId,
  });

  const authResult = await ensureApiUser(request);
  if (!authResult.ok) {
    logger.warn('Unauthorized storage presign request');
    return authResult.response;
  }

  const rateLimitResult = await enforceRateLimit({
    request,
    scope: 'storage-presign',
    limit: 10,
    window: '1 m',
    userId: authResult.user.id,
  });

  if (!rateLimitResult.ok) {
    logger.warn(
      { userId: authResult.user.id },
      'Storage presign rate limit exceeded'
    );
    return rateLimitResult.response;
  }

  let body: PresignRequestBody;
  try {
    body = (await request.json()) as PresignRequestBody;
  } catch {
    logger.warn('Presign failed: invalid JSON body');
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid JSON body',
        code: ErrorCodes.StorageInvalidContentType,
        retryable: false,
      },
      { status: 400 }
    );
  }

  const { filename, contentType, folder, size } = body;

  if (!filename || typeof filename !== 'string') {
    logger.warn('Presign failed: missing filename');
    return NextResponse.json(
      {
        success: false,
        error: 'Filename is required',
        code: ErrorCodes.StorageNoFile,
        retryable: false,
      },
      { status: 400 }
    );
  }

  if (!contentType || typeof contentType !== 'string') {
    logger.warn('Presign failed: missing contentType');
    return NextResponse.json(
      {
        success: false,
        error: 'Content type is required',
        code: ErrorCodes.StorageInvalidContentType,
        retryable: false,
      },
      { status: 400 }
    );
  }

  if (typeof size !== 'number' || Number.isNaN(size)) {
    logger.warn('Presign failed: invalid or missing file size', { size });
    return NextResponse.json(
      {
        success: false,
        error: 'File size is required',
        code: ErrorCodes.StorageFileTooLarge,
        retryable: false,
      },
      { status: 400 }
    );
  }

  if (!Number.isFinite(size) || size <= 0) {
    logger.warn('Presign failed: non-positive file size', { size });
    return NextResponse.json(
      {
        success: false,
        error: 'File size must be greater than 0',
        code: ErrorCodes.StorageFileTooLarge,
        retryable: false,
      },
      { status: 400 }
    );
  }

  if (size > MAX_FILE_SIZE) {
    logger.warn('Presign failed: file size exceeds limit', { size });
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

  // For now we align with upload route and only support image types via presign.
  if (!contentType.toLowerCase().startsWith('image/')) {
    logger.warn('Presign failed: unsupported content type', { contentType });
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

  try {
    const resolvedFolder = resolveTargetFolder(folder ?? null, authResult.user.id);
    if (!resolvedFolder.ok) {
      logger.warn(
        { folder, userId: authResult.user.id },
        'Presign failed: invalid folder'
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

    const provider = getStorageProvider();
    if (
      !('createPresignedUploadUrl' in provider) ||
      typeof (provider as any).createPresignedUploadUrl !== 'function'
    ) {
      logger.error(
        'Presign failed: current storage provider does not support presigned URLs'
      );
      return NextResponse.json(
        {
          success: false,
          error: 'Presigned uploads are not supported by current storage provider',
          code: ErrorCodes.StorageProviderError,
          retryable: false,
        },
        { status: 500 }
      );
    }

    const keyFolder = resolvedFolder.folder;
    const extension = filename.split('.').pop() || '';
    const uniqueSuffix = randomUUID();
    const uniqueName = extension
      ? `${uniqueSuffix}.${extension}`
      : uniqueSuffix;
    const key = `${keyFolder}/${uniqueName}`;

    const { uploadUrl, method, publicUrl } = await (provider as any).createPresignedUploadUrl({
      key,
      contentType,
      expiresInSeconds: 900,
    });

    logger.info(
      {
        userId: authResult.user.id,
        folder: keyFolder,
        key,
      },
      'Generated storage presigned upload URL'
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          uploadUrl,
          method,
          key,
          publicUrl,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error({ error }, 'Error generating storage presigned URL');

    if (error instanceof ConfigurationError || error instanceof StorageError) {
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
        error: 'Something went wrong while generating presigned URL',
        code: ErrorCodes.StorageUnknownError,
        retryable: true,
      },
      { status: 500 }
    );
  }
}
