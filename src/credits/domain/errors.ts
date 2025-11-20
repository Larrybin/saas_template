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
