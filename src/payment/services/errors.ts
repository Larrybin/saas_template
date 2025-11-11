export class PaymentSecurityError extends Error {
  readonly code = 'PAYMENT_SECURITY_VIOLATION';

  constructor(message: string) {
    super(message);
    this.name = 'PaymentSecurityError';
  }
}
