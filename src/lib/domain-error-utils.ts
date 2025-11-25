export const AUTH_BANNED_FALLBACK_MESSAGE =
  'Your account has been suspended. Please contact support.';

type DomainErrorMessageDefinition = {
  key: string;
  fallback?: string;
};

const DOMAIN_ERROR_MESSAGES: Record<string, DomainErrorMessageDefinition> = {
  CREDITS_INSUFFICIENT_BALANCE: {
    key: 'Dashboard.settings.credits.balance.insufficientCredits',
  },
  PAYMENT_SECURITY_VIOLATION: {
    key: 'Dashboard.settings.credits.packages.purchaseFailed',
  },
  AUTH_UNAUTHORIZED: {
    key: 'Common.unauthorized',
    fallback: 'Please sign in to continue.',
  },
  AUTH_BANNED: {
    key: 'Common.accountBanned',
    fallback: AUTH_BANNED_FALLBACK_MESSAGE,
  },
  AI_CONTENT_VALIDATION_ERROR: {
    key: 'AITextPage.analyzer.errors.invalidUrl',
  },
  AI_CONTENT_NETWORK_ERROR: {
    key: 'AITextPage.analyzer.errors.networkError',
  },
  AI_CONTENT_TIMEOUT: { key: 'AITextPage.analyzer.errors.timeout' },
  AI_CONTENT_RATE_LIMIT: {
    key: 'AITextPage.analyzer.errors.rateLimit',
  },
  AI_CONTENT_AUTH_ERROR: {
    key: 'AITextPage.analyzer.errors.authError',
  },
  AI_CONTENT_SERVICE_UNAVAILABLE: {
    key: 'AITextPage.analyzer.errors.serviceUnavailable',
  },
  AI_CONTENT_ANALYSIS_ERROR: {
    key: 'AITextPage.analyzer.errors.analysisError',
  },
  AI_CONTENT_SCRAPING_ERROR: {
    key: 'AITextPage.analyzer.errors.scrapingError',
  },
  AI_CONTENT_UNKNOWN_ERROR: {
    key: 'AITextPage.analyzer.errors.unknownError',
  },
  AI_IMAGE_INVALID_JSON: { key: 'AIImagePage.errors.invalidRequest' },
  AI_IMAGE_INVALID_PARAMS: { key: 'AIImagePage.errors.invalidParams' },
  AI_IMAGE_INVALID_RESPONSE: { key: 'AIImagePage.errors.providerError' },
  AI_IMAGE_TIMEOUT: { key: 'AIImagePage.errors.timeout' },
  AI_IMAGE_PROVIDER_ERROR: { key: 'AIImagePage.errors.providerError' },
};

export type DomainErrorLike = {
  code?: string;
  retryable?: boolean;
};

export type AuthEnvelopePayload =
  | {
      code: string | undefined;
      error: string | undefined;
    }
  | null
  | undefined;

export type AuthEnvelopeHandler = (payload: AuthEnvelopePayload) => void;

export type EnvelopeWithDomainError<TSuccess> =
  | (TSuccess & { success: true })
  | ({ success?: boolean; error?: string } & DomainErrorLike);

/**
 * Typical envelope shape returned from safe actions or API routes:
 *
 * type GetSomethingSuccess = { success: true; data: { /* ... *\/ } };
 * type GetSomethingEnvelope =
 *   | GetSomethingSuccess
 *   | { success?: false; error?: string; code?: string; retryable?: boolean };
 *
 * On the client, prefer using `unwrapEnvelopeOrThrowDomainError` inside hooks
 * instead of manually checking `result?.data?.success` in every component.
 */

type Translator = (key: string) => string;

export function getDomainErrorMessage(
  code: string | undefined,
  t?: Translator,
  fallbackMessage = 'Something went wrong while processing the request'
): string {
  if (!code) {
    return fallbackMessage;
  }
  const definition = DOMAIN_ERROR_MESSAGES[code];
  if (definition) {
    if (t) {
      return t(definition.key);
    }
    return definition.fallback ?? fallbackMessage;
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

export function unwrapEnvelopeOrThrowDomainError<TSuccess>(
  data: EnvelopeWithDomainError<TSuccess> | undefined,
  options: {
    defaultErrorMessage: string;
    handleAuthEnvelope?: AuthEnvelopeHandler;
  }
): TSuccess & { success: true } {
  const { defaultErrorMessage, handleAuthEnvelope } = options;

  if (!data) {
    throw new Error(defaultErrorMessage);
  }

  if (!('success' in data) || data.success) {
    return data as TSuccess & { success: true };
  }

  handleAuthEnvelope?.({ code: data.code, error: data.error });
  // From here on, the error is treated as a domain error and converted
  // into an Error instance with an optional `code` / `retryable` flag.

  const resolvedMessage =
    data.error ??
    getDomainErrorMessage(data.code, undefined, defaultErrorMessage);

  const error = new Error(resolvedMessage) as Error & DomainErrorLike;
  if (typeof data.code === 'string') {
    error.code = data.code;
  }
  if (typeof data.retryable === 'boolean') {
    error.retryable = data.retryable;
  }

  throw error;
}
