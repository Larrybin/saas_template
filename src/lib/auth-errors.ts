import { DomainError } from '@/lib/domain-errors';
import { type AuthErrorCode, ErrorCodes } from '@/lib/server/error-codes';

export class AuthError extends DomainError<AuthErrorCode> {
  constructor(
    message: string,
    code: AuthErrorCode = ErrorCodes.AuthError,
    retryable = false
  ) {
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
    super(message, ErrorCodes.AuthUnauthorized, false);
    this.name = 'UnauthorizedError';
  }
}
