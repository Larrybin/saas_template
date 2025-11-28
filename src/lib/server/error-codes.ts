export const ErrorCodes = {
  UnexpectedError: 'UNEXPECTED_ERROR',
  AiChatInvalidJson: 'AI_CHAT_INVALID_JSON',
  AiChatInvalidParams: 'AI_CHAT_INVALID_PARAMS',
  ImageGenerateInvalidJson: 'AI_IMAGE_INVALID_JSON',
  ImageGenerateInvalidParams: 'AI_IMAGE_INVALID_PARAMS',
  ImageProviderError: 'AI_IMAGE_PROVIDER_ERROR',
  ImageInvalidResponse: 'AI_IMAGE_INVALID_RESPONSE',
  ImageTimeout: 'AI_IMAGE_TIMEOUT',
  AnalyzeContentInvalidJson: 'ANALYZE_CONTENT_INVALID_JSON',
  AnalyzeContentInvalidParams: 'ANALYZE_CONTENT_INVALID_PARAMS',
  CreditsDistributionFailed: 'CREDITS_DISTRIBUTION_FAILED',
  StorageInvalidContentType: 'STORAGE_INVALID_CONTENT_TYPE',
  StorageNoFile: 'STORAGE_NO_FILE',
  StorageFileTooLarge: 'STORAGE_FILE_TOO_LARGE',
  StorageUnsupportedType: 'STORAGE_UNSUPPORTED_TYPE',
  StorageInvalidFolder: 'STORAGE_INVALID_FOLDER',
  StorageProviderError: 'STORAGE_PROVIDER_ERROR',
  StorageUnknownError: 'STORAGE_UNKNOWN_ERROR',
  BillingPlanNotFound: 'BILLING_PLAN_NOT_FOUND',
  BillingPriceNotFound: 'BILLING_PRICE_NOT_FOUND',
  CreditsInvalidPayload: 'CREDITS_INVALID_PAYLOAD',
  CreditsInsufficientBalance: 'CREDITS_INSUFFICIENT_BALANCE',
  CreditsPlanPolicyMissing: 'CREDITS_PLAN_POLICY_MISSING',
  AuthError: 'AUTH_ERROR',
  AuthUnauthorized: 'AUTH_UNAUTHORIZED',
  AuthBanned: 'AUTH_BANNED',
  PaymentSecurityViolation: 'PAYMENT_SECURITY_VIOLATION',
  AiContentValidationError: 'AI_CONTENT_VALIDATION_ERROR',
  AiContentNetworkError: 'AI_CONTENT_NETWORK_ERROR',
  AiContentTimeout: 'AI_CONTENT_TIMEOUT',
  AiContentRateLimit: 'AI_CONTENT_RATE_LIMIT',
  AiContentAuthError: 'AI_CONTENT_AUTH_ERROR',
  AiContentServiceUnavailable: 'AI_CONTENT_SERVICE_UNAVAILABLE',
  AiContentAnalysisError: 'AI_CONTENT_ANALYSIS_ERROR',
  AiContentScrapingError: 'AI_CONTENT_SCRAPING_ERROR',
  AiContentUnknownError: 'AI_CONTENT_UNKNOWN_ERROR',
  StripeWebhookUnexpectedError: 'STRIPE_WEBHOOK_UNEXPECTED_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export type BillingErrorCode =
  | (typeof ErrorCodes)['BillingPlanNotFound']
  | (typeof ErrorCodes)['BillingPriceNotFound'];

export type CreditsErrorCode =
  | (typeof ErrorCodes)['CreditsInvalidPayload']
  | (typeof ErrorCodes)['CreditsInsufficientBalance']
  | (typeof ErrorCodes)['CreditsPlanPolicyMissing'];

export type AuthErrorCode =
  | (typeof ErrorCodes)['AuthError']
  | (typeof ErrorCodes)['AuthUnauthorized']
  | (typeof ErrorCodes)['AuthBanned'];

export type PaymentErrorCode = (typeof ErrorCodes)['PaymentSecurityViolation'];

export type StorageErrorCode =
  | (typeof ErrorCodes)['StorageInvalidContentType']
  | (typeof ErrorCodes)['StorageNoFile']
  | (typeof ErrorCodes)['StorageFileTooLarge']
  | (typeof ErrorCodes)['StorageUnsupportedType']
  | (typeof ErrorCodes)['StorageInvalidFolder']
  | (typeof ErrorCodes)['StorageProviderError']
  | (typeof ErrorCodes)['StorageUnknownError'];

export type WebContentErrorCode =
  | (typeof ErrorCodes)['AiContentValidationError']
  | (typeof ErrorCodes)['AiContentNetworkError']
  | (typeof ErrorCodes)['AiContentTimeout']
  | (typeof ErrorCodes)['AiContentRateLimit']
  | (typeof ErrorCodes)['AiContentAuthError']
  | (typeof ErrorCodes)['AiContentServiceUnavailable']
  | (typeof ErrorCodes)['AiContentAnalysisError']
  | (typeof ErrorCodes)['AiContentScrapingError']
  | (typeof ErrorCodes)['AiContentUnknownError'];
