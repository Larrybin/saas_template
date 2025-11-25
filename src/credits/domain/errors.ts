import { DomainError } from '@/lib/domain-errors';

export class InvalidCreditPayloadError extends DomainError {
  constructor(message: string) {
    super({
      code: 'CREDITS_INVALID_PAYLOAD',
      message,
      retryable: false,
    });
    this.name = 'InvalidCreditPayloadError';
  }
}

export class InsufficientCreditsError extends DomainError {
  constructor(message = 'Insufficient credits') {
    super({
      code: 'CREDITS_INSUFFICIENT_BALANCE',
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
      code: 'CREDITS_PLAN_POLICY_MISSING',
      message,
      retryable: false,
    });
    this.name = 'CreditsPlanPolicyMissingError';
  }
}
