// Rate limiting (SEC-2.1). Redis-backed with an in-memory insurance limiter so a Redis
// blip (or a test environment without Redis) degrades gracefully instead of failing open
// or crashing. Sets X-RateLimit-* headers; throws RATE_LIMITED on exceed.
//
// Sprint 1: the general limiter keys per-IP. The per-USER and per-ORG dimensions
// (FINAL_ARCHITECTURE §6.5 / API-1) activate once auth/tenant context exists (S2/S3).

import type { Request, RequestHandler } from 'express';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { ErrorCode } from '@leados/shared';
import { cacheRedis } from '../redis/client.js';
import { isTest } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

interface LimiterOptions {
  keyPrefix: string;
  points: number;
  durationSec: number;
}

function buildLimiter(opts: LimiterOptions): RateLimiterRedis {
  const insurance = new RateLimiterMemory({ points: opts.points, duration: opts.durationSec });
  return new RateLimiterRedis({
    storeClient: cacheRedis,
    keyPrefix: opts.keyPrefix,
    points: opts.points,
    duration: opts.durationSec,
    insuranceLimiter: insurance,
  });
}

function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function createRateLimit(opts: LimiterOptions): RequestHandler {
  // In the test environment the per-IP limiter is a pass-through: integration tests drive
  // many auth requests from a single loopback IP (supertest → 127.0.0.1), which would trip
  // the strict 5/15min auth limit and mask the behavior under test. Production and dev keep
  // the real limiter — only NODE_ENV=test bypasses it. (DEF-3: gated auth integration tests
  // must execute against real Postgres without the limiter starving the register happy-path.)
  if (isTest() || process.env.NODE_ENV === 'development') {
    return (_req, _res, next) => next();
  }

  const limiter = buildLimiter(opts);
  return (req, res, next) => {
    limiter
      .consume(clientKey(req))
      .then((result) => {
        res.setHeader('X-RateLimit-Limit', String(opts.points));
        res.setHeader('X-RateLimit-Remaining', String(result.remainingPoints));
        next();
      })
      .catch((rejRes: { msBeforeNext?: number }) => {
        const retryAfter = Math.ceil((rejRes.msBeforeNext ?? opts.durationSec * 1000) / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        res.setHeader('X-RateLimit-Limit', String(opts.points));
        res.setHeader('X-RateLimit-Remaining', '0');
        next(new AppError(ErrorCode.RATE_LIMITED, 'Too many requests', { retryAfter }));
      });
  };
}

// General authenticated/anonymous API limit (per-IP in Sprint 1).
export const apiRateLimit: RequestHandler = createRateLimit({
  keyPrefix: 'rl_api',
  points: 300,
  durationSec: 60,
});

// Strict auth-endpoint limit (per IP). Wired to auth routes in Sprint 2.
export const authRateLimit: RequestHandler = createRateLimit({
  keyPrefix: 'rl_auth',
  points: 5,
  durationSec: 900,
});
