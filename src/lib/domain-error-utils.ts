const DOMAIN_ERROR_I18N_KEYS: Record<string, string> = {
  CREDITS_INSUFFICIENT_BALANCE:
    'Dashboard.settings.credits.balance.insufficientCredits',
  PAYMENT_SECURITY_VIOLATION:
    'Dashboard.settings.credits.packages.purchaseFailed',
};

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
