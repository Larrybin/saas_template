import { websiteConfig } from '@/config/website';

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

export type FolderResolutionResult =
  | { ok: true; folder: string }
  | { ok: false; error: string };

export function resolveTargetFolder(
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

