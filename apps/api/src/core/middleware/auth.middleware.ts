// Auth middleware (Sprint 2). Verifies a Bearer access token if present and attaches
// req.auth. Behavior:
//   - no Authorization header     → continue WITHOUT req.auth (route guards decide)
//   - valid Bearer token          → attach req.auth { userId, organizationId, role, ... }
//   - present but invalid/expired → 401 UNAUTHORIZED
//
// `requireAuth` is the guard that rejects when req.auth is absent — use it on protected
// routes. (Tenant membership validation + scoped db client are added in Sprint 3.)

import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../auth/jwt.js';
import { AppError } from '../errors/app-error.js';

export const authMiddleware: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const claims = verifyAccessToken(token);
    req.auth = {
      userId: claims.sub,
      organizationId: claims.orgId,
      role: claims.role,
      isSuperAdmin: claims.isSuperAdmin,
    };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired access token'));
  }
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(AppError.unauthorized('Authentication required'));
    return;
  }
  next();
};

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(AppError.unauthorized('Authentication required'));
    return;
  }
  if (!req.auth.isSuperAdmin) {
    next(AppError.forbidden('Super Admin privileges required'));
    return;
  }
  next();
};
