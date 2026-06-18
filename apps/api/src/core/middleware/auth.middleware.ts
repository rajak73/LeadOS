// Auth middleware — STUB (Sprint 1).
// Real implementation lands in Sprint 2: verify JWT access token, attach user to request.
// Shipping it now would be implementing a future sprint. This pass-through exists only so
// the middleware order in app.ts is established and stable.

import type { RequestHandler } from 'express';

export const authMiddleware: RequestHandler = (_req, _res, next) => {
  next();
};
