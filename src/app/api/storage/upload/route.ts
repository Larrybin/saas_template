import { type NextRequest, NextResponse } from 'next/server';
import { websiteConfig } from '@/config/website';
import {
  createErrorEnvelope,
  createSuccessEnvelope,
} from '@/lib/domain-error-utils';
import { ensureApiUser } from '@/lib/server/api-auth';
import { ErrorCodes } from '@/lib/server/error-codes';
import { createLoggerFromHeaders, resolveRequestId } from '@/lib/server/logger';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { uploadFile } from '@/storage';
import { StorageError } from '@/storage/types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SAFE_FOLDER_REGEX = /^[a-z0-9/_-]+$/i;
const FALLBACK_ALLOWED_FOLDER_ROOTS = ['uploads', 'avatars', 'attachments'];
const configuredFolderRoots =
  websiteConfig.storage.allowedFolders &&
  websiteConfig.storage.allowedFolders.length > 0
    ? websiteConfig.storage.allowedFolders
    : FALLBACK_ALLOWED_FOLDER_ROOTS;
const ALLOWED_FOLDER_ROOTS = new Set(
  configuredFolderRoots.map((folder) => folder.toLowerCase())
);
const DEFAULT_FOLDER_ROOT =
  configuredFolderRoots[0]?.toLowerCase() ?? FALLBACK_ALLOWED_FOLDER_ROOTS[0];

type FolderResolutionResult =
  | { ok: true; folder: string }
  | { ok: false; error: string };

function resolveTargetFolder(
  folder: string | null,
  userId: string
): FolderResolutionResult {
  const rawValue = (folder ?? '').trim();
  if (!rawValue) {
    return { ok: true, folder: `${DEFAULT_FOLDER_ROOT}/${userId}` };
  }

  const sanitized = rawValue.replace(/^\/*/, '').replace(/\/*$/, '');
  if (!sanitized || !SAFE_FOLDER_REGEX.test(sanitized)) {
    return {
      ok: false,
      error: 'Folder contains invalid characters',
    };
  }

  const segments = sanitized.split('/');
  const rootSegment = segments[0] ?? '';
  const rootKey = rootSegment.toLowerCase();
  if (!ALLOWED_FOLDER_ROOTS.has(rootKey)) {
    return {
      ok: false,
      error: 'Folder is not allowed',
    };
  }

  const subPath = segments.slice(1).join('/');
  const basePath = subPath ? `${rootKey}/${subPath}` : rootKey;
  const normalizedSegments = basePath.split('/').filter(Boolean);
  const trailingSegment =
    normalizedSegments[normalizedSegments.length - 1] ?? '';
  const hasUserSuffix = trailingSegment === userId;
  return {
    ok: true,
    folder: hasUserSuffix ? basePath : `${basePath}/${userId}`,
  };
}

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
      createErrorEnvelope(
        ErrorCodes.StorageInvalidContentType,
        'Content-Type must be multipart/form-data',
        false
      ),
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
        createErrorEnvelope(
          ErrorCodes.StorageNoFile,
          'No file provided',
          false
        ),
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > MAX_FILE_SIZE) {
      logger.warn('Upload failed: file size exceeds limit', {
        size: file.size,
      });
      return NextResponse.json(
        createErrorEnvelope(
          ErrorCodes.StorageFileTooLarge,
          'File size exceeds the 10MB limit',
          false
        ),
        { status: 400 }
      );
    }

    // Validate file type (optional, based on your requirements)
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      logger.warn('Upload failed: unsupported file type', {
        type: file.type,
      });
      return NextResponse.json(
        createErrorEnvelope(
          ErrorCodes.StorageUnsupportedType,
          'File type not supported',
          false
        ),
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
        createErrorEnvelope(
          ErrorCodes.StorageInvalidFolder,
          resolvedFolder.error,
          false
        ),
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
    return NextResponse.json(createSuccessEnvelope(result), { status: 200 });
  } catch (error) {
    logger.error({ error }, 'Error uploading file');

    if (error instanceof StorageError) {
      return NextResponse.json(
        createErrorEnvelope(
          ErrorCodes.StorageProviderError,
          error.message,
          true
        ),
        { status: 500 }
      );
    }

    return NextResponse.json(
      createErrorEnvelope(
        ErrorCodes.StorageUnknownError,
        'Something went wrong while uploading the file',
        true
      ),
      { status: 500 }
    );
  }
}
