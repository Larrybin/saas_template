import { DomainError } from '@/lib/domain-errors';

export class AuthError extends DomainError {
  constructor(message: string, code = 'AUTH_ERROR', retryable = false) {
    super({
      code,
      message,
      retryable,
    });
    this.name = 'AuthError';
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = 'Unauthorized') {
    super(message, 'AUTH_UNAUTHORIZED', false);
    this.name = 'UnauthorizedError';
  }
}
