// Global Express error handler. Converts thrown errors into the standard error envelope,
// hides internals in production, logs, and reports 5xx to Sentry.

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ErrorCode } from '@leados/shared';
import { AppError } from './app-error.js';
import { errorEnvelope } from '../http/envelope.js';
import { isProduction } from '../config/env.js';
import { logger } from '../observability/logger.js';
import { captureException } from '../observability/sentry.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = (req as { context?: { requestId?: string } }).context?.requestId;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ message: err.message, code: err.code, requestId });
      captureException(err);
    } else {
      logger.warn({ message: err.message, code: err.code, requestId });
    }
    res
      .status(err.statusCode)
      .json(errorEnvelope(err.code, err.message, err.statusCode, err.details));
    return;
  }

  // Unexpected error → 500, never leak the stack/message in production.
  logger.error({
    message: 'Unhandled error',
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    requestId,
  });
  captureException(err);

  const message = isProduction() ? 'An unexpected error occurred' : String(err);
  res.status(500).json(errorEnvelope(ErrorCode.INTERNAL_ERROR, message, 500));
};
