export class DomainError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(options: { code: string; message: string; retryable?: boolean }) {
    super(options.message);
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.name = 'DomainError';
  }
}
