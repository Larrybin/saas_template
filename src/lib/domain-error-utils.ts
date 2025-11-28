import { type ErrorCode, ErrorCodes } from '@/lib/server/error-codes';

export const AUTH_BANNED_FALLBACK_MESSAGE =
  'Your account has been suspended. Please contact support.';

type DomainErrorMessageDefinition = {
  key: string;
  fallback?: string;
};

export const DOMAIN_ERROR_MESSAGES: Record<
  string,
  DomainErrorMessageDefinition
> = {
  [ErrorCodes.CreditsInsufficientBalance]: {
    key: 'Dashboard.settings.credits.balance.insufficientCredits',
  },
  [ErrorCodes.PaymentSecurityViolation]: {
    key: 'Dashboard.settings.credits.packages.purchaseFailed',
  },
  [ErrorCodes.AuthUnauthorized]: {
    key: 'Common.unauthorized',
    fallback: 'Please sign in to continue.',
  },
  [ErrorCodes.AuthBanned]: {
    key: 'Common.accountBanned',
    fallback: AUTH_BANNED_FALLBACK_MESSAGE,
  },
  [ErrorCodes.AiContentValidationError]: {
    key: 'AITextPage.analyzer.errors.invalidUrl',
  },
  [ErrorCodes.AiContentNetworkError]: {
    key: 'AITextPage.analyzer.errors.networkError',
  },
  [ErrorCodes.AiContentTimeout]: {
    key: 'AITextPage.analyzer.errors.timeout',
  },
  [ErrorCodes.AiContentRateLimit]: {
    key: 'AITextPage.analyzer.errors.rateLimit',
  },
  [ErrorCodes.AiContentAuthError]: {
    key: 'AITextPage.analyzer.errors.authError',
  },
  [ErrorCodes.AiContentServiceUnavailable]: {
    key: 'AITextPage.analyzer.errors.serviceUnavailable',
  },
  [ErrorCodes.AiContentAnalysisError]: {
    key: 'AITextPage.analyzer.errors.analysisError',
  },
  [ErrorCodes.AiContentScrapingError]: {
    key: 'AITextPage.analyzer.errors.scrapingError',
  },
  [ErrorCodes.AiContentUnknownError]: {
    key: 'AITextPage.analyzer.errors.unknownError',
  },
  [ErrorCodes.ImageGenerateInvalidJson]: {
    key: 'AIImagePage.errors.invalidRequest',
  },
  [ErrorCodes.ImageGenerateInvalidParams]: {
    key: 'AIImagePage.errors.invalidParams',
  },
  [ErrorCodes.ImageInvalidResponse]: {
    key: 'AIImagePage.errors.providerError',
  },
  [ErrorCodes.ImageTimeout]: {
    key: 'AIImagePage.errors.timeout',
  },
  [ErrorCodes.ImageProviderError]: {
    key: 'AIImagePage.errors.providerError',
  },
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

/**
 * 标准 JSON 成功 envelope：`{ success: true, ...T }`。
 *
 * - 推荐用于 API Route / safe-action 的成功返回。
 * - 与 `EnvelopeWithDomainError<TSuccess>` 中的成功分支保持兼容。
 */
export type SuccessEnvelope<T> = T & { success: true };

/**
 * 标准 JSON 错误 envelope：`{ success: false, error, code, retryable }`。
 *
 * - `code` 必须来自 `ErrorCodes`，在类型层面受 `ErrorCode` 约束。
 * - `retryable` 表示客户端是否可以安全重试（用于 UI 与重试策略）。
 */
export type ErrorEnvelope = {
  success: false;
  error: string;
  code: ErrorCode;
  retryable: boolean;
};

/**
 * Envelope shape for unified JSON API / safe-action responses.
 *
 * - 成功分支：`{ success: true, ...TSuccess }`
 * - 失败分支：`{ success?: false; error?: string; code?: string; retryable?: boolean }`
 *
 * 具体协议约定见 `docs/api-protocol.md`，仅适用于遵循该 JSON envelope 的路由 / actions，
 * 不用于 chat 流式接口、webhook、ping 等特例。
 */
export type EnvelopeWithDomainError<TSuccess> =
  | (TSuccess & { success: true })
  | ({ success?: boolean; error?: string } & DomainErrorLike);

/**
 * Typical envelope shape returned from safe actions or JSON API routes
 * that follow `docs/api-protocol.md`:
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

/**
 * 构造标准成功 envelope：`{ success: true, data }`。
 *
 * - 常用于 API Route / safe-action 成功返回；
 * - 为保持简单，不在内部附加额外字段，仅包装传入的 `data`。
 */
export function createSuccessEnvelope<T>(
  data: T
): SuccessEnvelope<{ data: T }> {
  return {
    success: true,
    data,
  };
}

/**
 * 构造标准错误 envelope：`{ success: false, error, code, retryable }`。
 *
 * - `code` 使用 `ErrorCode`，保证与 `ErrorCodes` 一致；
 * - `retryable` 需由调用方根据错误语义判断。
 */
export function createErrorEnvelope(
  code: ErrorCode,
  message: string,
  retryable: boolean
): ErrorEnvelope {
  return {
    success: false,
    error: message,
    code,
    retryable,
  };
}

/**
 * 从具有 `code` / `message` / 可选 `retryable` 的错误对象构造标准错误 envelope。
 *
 * - 典型用例：API Route 中捕获到的 `DomainError`；
 * - 若未显式设置 `retryable`，默认视为 `false`。
 */
export function createErrorEnvelopeFromDomainError(error: {
  code: ErrorCode;
  message: string;
  retryable?: boolean;
}): ErrorEnvelope {
  return createErrorEnvelope(
    error.code,
    error.message,
    error.retryable ?? false
  );
}

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

  // Only treat envelopes with an explicit success === true as success.
  // Any other shape (missing success flag or success === false) is handled
  // as a failure and passed through the domain-error path.
  const successFlag = (data as { success?: boolean }).success;
  if (successFlag === true) {
    return data as TSuccess & { success: true };
  }

  const errorEnvelope = data as {
    success?: boolean;
    error?: string;
  } & DomainErrorLike;

  handleAuthEnvelope?.({
    code: errorEnvelope.code,
    error: errorEnvelope.error,
  });
  // From here on, the error is treated as a domain error and converted
  // into an Error instance with an optional `code` / `retryable` flag.

  const resolvedMessage =
    errorEnvelope.error ??
    getDomainErrorMessage(errorEnvelope.code, undefined, defaultErrorMessage);

  const error = new Error(resolvedMessage) as Error & DomainErrorLike;
  if (typeof errorEnvelope.code === 'string') {
    error.code = errorEnvelope.code;
  }
  if (typeof errorEnvelope.retryable === 'boolean') {
    error.retryable = errorEnvelope.retryable;
  }

  throw error;
}
