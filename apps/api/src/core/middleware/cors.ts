// CORS (SEC-1.1). Same-site allow-list only (FINAL_ARCHITECTURE §6.4). credentials:true is
// required so the refresh cookie is sent. Origins derive from APP_WEB_ORIGIN.

import cors from 'cors';
import { env } from '../config/env.js';

function allowedOrigins(): string[] {
  const web = env.APP_WEB_ORIGIN;
  const wwwVariant = web.replace('://app.', '://www.');
  return Array.from(new Set([web, wwwVariant]));
}

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow same-origin / non-browser (no Origin header) requests.
    if (!origin) return callback(null, true);
    if (allowedOrigins().includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400,
});
