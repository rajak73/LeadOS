// Helpers to build the standard success/error response envelopes (doc 10 §10.2).

import type { Response } from 'express';
import type { ErrorEnvelope, PaginationMeta, SuccessEnvelope } from '@leados/shared';

export function successEnvelope<T>(data: T, meta?: PaginationMeta): SuccessEnvelope<T> {
  return meta ? { success: true, data, meta } : { success: true, data };
}

export function errorEnvelope(
  code: ErrorEnvelope['error']['code'],
  message: string,
  statusCode: number,
  details?: Record<string, unknown>,
): ErrorEnvelope {
  return {
    success: false,
    error: details ? { code, message, statusCode, details } : { code, message, statusCode },
  };
}

export function sendSuccess<T>(res: Response, data: T, status = 200, meta?: PaginationMeta): void {
  res.status(status).json(successEnvelope(data, meta));
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
}
