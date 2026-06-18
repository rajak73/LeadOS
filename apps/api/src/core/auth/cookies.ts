// Refresh-token cookie helpers (doc 19 §19.1, FINAL_ARCHITECTURE §3.2): HttpOnly, Secure,
// SameSite=Strict, scoped to the auth path. Same-site domains make this work across the
// app/api subdomains (P0-4). The access token is NOT a cookie (it stays in client memory).

import type { Response } from 'express';
import { env, isProduction } from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'leados_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
    ...(env.SESSION_COOKIE_DOMAIN ? { domain: env.SESSION_COOKIE_DOMAIN } : {}),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    ...(env.SESSION_COOKIE_DOMAIN ? { domain: env.SESSION_COOKIE_DOMAIN } : {}),
  });
}
