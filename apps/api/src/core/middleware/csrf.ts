// CSRF guard for cookie-driven endpoints (refresh, logout) — FINAL_ARCHITECTURE §3.4 /
// doc 19 §19.1. Requires a custom request header (which browsers cannot set cross-origin
// without a CORS preflight that our allow-list rejects) AND, when present, a same-site
// Origin/Referer. Bearer-token endpoints are not cookie-driven and don't need this.

import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

function allowedOrigins(): string[] {
  const web = env.APP_WEB_ORIGIN;
  return [web, web.replace('://app.', '://www.')];
}

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export const csrfGuard: RequestHandler = (req, _res, next) => {
  // 1) Require the custom header (cross-origin JS cannot set it without a blocked preflight).
  if (!req.headers['x-csrf-token']) {
    next(AppError.forbidden('Missing CSRF token header'));
    return;
  }
  // 2) If an Origin/Referer is present, it must be same-site.
  const origin = req.headers.origin ?? originOf(req.headers.referer);
  if (origin && !allowedOrigins().includes(origin)) {
    next(AppError.forbidden('Cross-site request rejected'));
    return;
  }
  next();
};
