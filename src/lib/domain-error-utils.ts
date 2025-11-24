const DOMAIN_ERROR_I18N_KEYS: Record<string, string> = {
  CREDITS_INSUFFICIENT_BALANCE:
    'Dashboard.settings.credits.balance.insufficientCredits',
  PAYMENT_SECURITY_VIOLATION:
    'Dashboard.settings.credits.packages.purchaseFailed',
  AUTH_UNAUTHORIZED: 'Common.unauthorized',
  AUTH_BANNED: 'Common.accountBanned',
  AI_CONTENT_VALIDATION_ERROR: 'AITextPage.analyzer.errors.invalidUrl',
  AI_CONTENT_NETWORK_ERROR: 'AITextPage.analyzer.errors.networkError',
  AI_CONTENT_TIMEOUT: 'AITextPage.analyzer.errors.timeout',
  AI_CONTENT_RATE_LIMIT: 'AITextPage.analyzer.errors.rateLimit',
  AI_CONTENT_AUTH_ERROR: 'AITextPage.analyzer.errors.authError',
  AI_CONTENT_SERVICE_UNAVAILABLE:
    'AITextPage.analyzer.errors.serviceUnavailable',
  AI_CONTENT_ANALYSIS_ERROR: 'AITextPage.analyzer.errors.analysisError',
  AI_CONTENT_SCRAPING_ERROR: 'AITextPage.analyzer.errors.scrapingError',
  AI_CONTENT_UNKNOWN_ERROR: 'AITextPage.analyzer.errors.unknownError',
  AI_IMAGE_INVALID_JSON: 'AIImagePage.errors.invalidRequest',
  AI_IMAGE_INVALID_PARAMS: 'AIImagePage.errors.invalidParams',
  AI_IMAGE_INVALID_RESPONSE: 'AIImagePage.errors.providerError',
  AI_IMAGE_TIMEOUT: 'AIImagePage.errors.timeout',
  AI_IMAGE_PROVIDER_ERROR: 'AIImagePage.errors.providerError',
};

export const AUTH_BANNED_FALLBACK_MESSAGE =
  'Your account has been suspended. Please contact support.';

export type DomainErrorLike = {
  code?: string;
  retryable?: boolean;
};

type Translator = (key: string) => string;

export function getDomainErrorMessage(
  code: string | undefined,
  t?: Translator,
  fallbackMessage = 'Something went wrong while processing the request'
): string {
  if (!code) {
    return fallbackMessage;
  }
  const key = DOMAIN_ERROR_I18N_KEYS[code];
  if (key && t) {
    return t(key);
  }
  if (key) {
    return key;
  }
  return fallbackMessage;
}

export function isDomainErrorResponse(
  payload: unknown
): payload is { success: false; error: string } & DomainErrorLike {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'success' in payload &&
    (payload as { success?: unknown }).success === false &&
    'error' in payload &&
    typeof (payload as { error?: unknown }).error === 'string'
  ) {
    return true;
  }
  return false;
}
