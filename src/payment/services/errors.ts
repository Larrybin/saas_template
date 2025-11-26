import { DomainError } from '@/lib/domain-errors';
import { ErrorCodes, type PaymentErrorCode } from '@/lib/server/error-codes';

export class PaymentSecurityError extends DomainError<PaymentErrorCode> {
  constructor(message: string) {
    super({
      code: ErrorCodes.PaymentSecurityViolation,
      message,
      retryable: false,
    });
    this.name = 'PaymentSecurityError';
  }
}
