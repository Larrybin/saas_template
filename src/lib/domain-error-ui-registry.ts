import type { ErrorCode } from '@/lib/server/error-codes';

export type ErrorUiSeverity = 'info' | 'warning' | 'error';

export type ErrorUiAction = 'none' | 'redirectToLogin' | 'openCreditsPage';

export type ErrorUiSource =
  | 'ai'
  | 'credits'
  | 'auth'
  | 'payment'
  | 'storage'
  | 'generic';

export type ErrorUiStrategy = {
  severity: ErrorUiSeverity;
  /**
   * 默认 fallback 文案（英文），避免完全缺失时 UI 没有提示。
   */
  defaultFallbackMessage?: string;
  action: ErrorUiAction;
  source: ErrorUiSource;
};

const ERROR_UI_STRATEGIES: Record<string, ErrorUiStrategy> = {
  AUTH_UNAUTHORIZED: {
    severity: 'warning',
    defaultFallbackMessage: 'Unauthorized',
    action: 'redirectToLogin',
    source: 'auth',
  },
  AUTH_BANNED: {
    severity: 'error',
    defaultFallbackMessage: 'Your account has been banned.',
    action: 'redirectToLogin',
    source: 'auth',
  },
  CREDITS_INSUFFICIENT_BALANCE: {
    severity: 'warning',
    defaultFallbackMessage: 'Insufficient credits balance',
    action: 'openCreditsPage',
    source: 'credits',
  },
  AI_CONTENT_TIMEOUT: {
    severity: 'warning',
    defaultFallbackMessage: 'AI request timed out',
    action: 'none',
    source: 'ai',
  },
  AI_IMAGE_TIMEOUT: {
    severity: 'warning',
    defaultFallbackMessage: 'AI request timed out',
    action: 'none',
    source: 'ai',
  },
  AI_CONTENT_RATE_LIMIT: {
    severity: 'warning',
    defaultFallbackMessage: 'AI requests are rate limited',
    action: 'none',
    source: 'ai',
  },
  AI_CONTENT_SERVICE_UNAVAILABLE: {
    severity: 'error',
    defaultFallbackMessage: 'AI service is temporarily unavailable',
    action: 'none',
    source: 'ai',
  },
  AI_IMAGE_PROVIDER_ERROR: {
    severity: 'error',
    defaultFallbackMessage: 'AI service is temporarily unavailable',
    action: 'none',
    source: 'ai',
  },
  AI_CONTENT_NETWORK_ERROR: {
    severity: 'error',
    defaultFallbackMessage: 'Network error while calling AI service',
    action: 'none',
    source: 'ai',
  },
  AI_CONTENT_VALIDATION_ERROR: {
    severity: 'info',
    defaultFallbackMessage: 'Invalid AI request parameters',
    action: 'none',
    source: 'ai',
  },
  AI_IMAGE_INVALID_PARAMS: {
    severity: 'info',
    defaultFallbackMessage: 'Invalid AI request parameters',
    action: 'none',
    source: 'ai',
  },
  AI_IMAGE_INVALID_JSON: {
    severity: 'info',
    defaultFallbackMessage: 'Request body must be valid JSON',
    action: 'none',
    source: 'ai',
  },
  PAYMENT_SECURITY_VIOLATION: {
    severity: 'error',
    defaultFallbackMessage: 'Payment security check failed',
    action: 'none',
    source: 'payment',
  },
  STORAGE_INVALID_CONTENT_TYPE: {
    severity: 'error',
    defaultFallbackMessage:
      'Content-Type must be multipart/form-data for uploads',
    action: 'none',
    source: 'storage',
  },
  STORAGE_NO_FILE: {
    severity: 'error',
    defaultFallbackMessage: 'No file provided',
    action: 'none',
    source: 'storage',
  },
  STORAGE_FILE_TOO_LARGE: {
    severity: 'error',
    defaultFallbackMessage: 'File size exceeds the allowed limit',
    action: 'none',
    source: 'storage',
  },
  STORAGE_UNSUPPORTED_TYPE: {
    severity: 'error',
    defaultFallbackMessage: 'This file type is not supported',
    action: 'none',
    source: 'storage',
  },
  STORAGE_INVALID_FOLDER: {
    severity: 'error',
    defaultFallbackMessage: 'The selected upload folder is not allowed',
    action: 'none',
    source: 'storage',
  },
  STORAGE_PROVIDER_ERROR: {
    severity: 'error',
    defaultFallbackMessage: 'Storage provider encountered an error',
    action: 'none',
    source: 'storage',
  },
  STORAGE_UNKNOWN_ERROR: {
    severity: 'error',
    defaultFallbackMessage: 'Unknown error while uploading file',
    action: 'none',
    source: 'storage',
  },
};

export function getErrorUiStrategy(
  code?: string | ErrorCode | null
): ErrorUiStrategy | null {
  if (!code) {
    return null;
  }
  const normalized = String(code);
  return ERROR_UI_STRATEGIES[normalized] ?? null;
}
