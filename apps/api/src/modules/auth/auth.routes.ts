// Auth routes (Sprint 2). PUBLIC — no auth/tenant middleware. Auth endpoints carry the
// strict per-IP rate limit (doc 10 §10.9). Mounted at /api/v1/auth.

import { Router } from 'express';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@leados/shared';
import { validate } from '../../core/middleware/validate.js';
import { authRateLimit } from '../../core/middleware/rate-limit.js';
import { csrfGuard } from '../../core/middleware/csrf.js';
import { authMiddleware, requireAuth } from '../../core/middleware/auth.middleware.js';
import { asyncHandler } from '../../core/http/async-handler.js';
import type { AuthController } from './auth.controller.js';

export function buildAuthRouter(controller: AuthController): Router {
  const router = Router();

  router.post(
    '/register',
    authRateLimit,
    validate(registerSchema),
    asyncHandler(controller.register),
  );

  router.post('/login', authRateLimit, validate(loginSchema), asyncHandler(controller.login));

  // Cookie-driven endpoints: CSRF-guarded (no Bearer token).
  router.post('/refresh', csrfGuard, asyncHandler(controller.refresh));
  router.post('/logout', csrfGuard, asyncHandler(controller.logout));

  // Password reset (public, rate-limited).
  router.post(
    '/forgot-password',
    authRateLimit,
    validate(forgotPasswordSchema),
    asyncHandler(controller.forgotPassword),
  );
  router.post(
    '/reset-password',
    authRateLimit,
    validate(resetPasswordSchema),
    asyncHandler(controller.resetPassword),
  );

  // Current user (Bearer access token).
  router.get('/me', authMiddleware, requireAuth, asyncHandler(controller.me));

  // Authenticated session management (Bearer access token).
  router.get('/sessions', authMiddleware, requireAuth, asyncHandler(controller.listSessions));
  router.delete(
    '/sessions/:id',
    authMiddleware,
    requireAuth,
    asyncHandler(controller.revokeSession),
  );

  router.post(
    '/verify-email',
    validate(verifyEmailSchema),
    asyncHandler(controller.verifyEmail),
  );

  router.post(
    '/resend-verification',
    authRateLimit,
    validate(resendVerificationSchema),
    asyncHandler(controller.resendVerification),
  );

  return router;
}
