import type { ErrorCode } from '@/lib/server/error-codes';

export class DomainError<TCode extends ErrorCode = ErrorCode> extends Error {
  readonly code: TCode;
  readonly retryable: boolean;

  constructor(options: { code: TCode; message: string; retryable?: boolean }) {
    super(options.message);
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.name = 'DomainError';
  }
}
