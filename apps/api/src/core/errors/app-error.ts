// Application error type. Carries a registry code that maps to an HTTP status.
// Controllers/services throw AppError; the global error handler turns it into the
// standard error envelope (doc 10 §10.2).

import { ErrorCode, ERROR_STATUS } from '@leados/shared';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational = true;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = ERROR_STATUS[code];
    if (details !== undefined) {
      this.details = details;
    }
    Error.captureStackTrace?.(this, AppError);
  }

  static notFound(message = 'Resource not found', details?: Record<string, unknown>): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message, details);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message);
  }

  static validation(message = 'Validation failed', details?: Record<string, unknown>): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, details);
  }
}
