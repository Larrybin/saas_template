import { DomainError } from '@/lib/domain-errors';

export class PaymentSecurityError extends DomainError {
  constructor(message: string) {
    super({
      code: 'PAYMENT_SECURITY_VIOLATION',
      message,
      retryable: false,
    });
    this.name = 'PaymentSecurityError';
  }
}
