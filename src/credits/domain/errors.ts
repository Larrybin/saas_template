import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes } from '@/lib/server/error-codes';

export class InvalidCreditPayloadError extends DomainError {
  constructor(message: string) {
    super({
      code: ErrorCodes.CreditsInvalidPayload,
      message,
      retryable: false,
    });
    this.name = 'InvalidCreditPayloadError';
  }
}

export class InsufficientCreditsError extends DomainError {
  constructor(message = 'Insufficient credits') {
    super({
      code: ErrorCodes.CreditsInsufficientBalance,
      message,
      retryable: false,
    });
    this.name = 'InsufficientCreditsError';
  }
}

export class CreditsPlanPolicyMissingError extends DomainError {
  constructor(
    message = 'Credits plan policy is missing for the given plan or price'
  ) {
    super({
      code: ErrorCodes.CreditsPlanPolicyMissing,
      message,
      retryable: false,
    });
    this.name = 'CreditsPlanPolicyMissingError';
  }
}
