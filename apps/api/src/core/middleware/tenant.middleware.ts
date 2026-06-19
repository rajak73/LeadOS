// TEN-2.4 — Tenant middleware (real; replaces the Sprint 1 stub).
//
// For an authenticated request it validates that the user is an ACTIVE member of the org in
// their token, then runs the rest of the request inside an AsyncLocalStorage tenant context
// (FINAL_ARCHITECTURE §2.4). Unauthenticated requests pass through untouched — establishing
// identity is authMiddleware's job and authorization is requireAuth/requirePermission's job;
// this middleware only governs tenant membership + context.

import type { RequestHandler } from 'express';
import { cacheRedis } from '../redis/client.js';
import { AppError } from '../errors/app-error.js';
import {
  CachedMembershipValidator,
  prismaMembershipLookup,
  type MembershipCache,
  type MembershipValidator,
} from '../tenancy/membership.js';
import { runWithTenantContext, type TenantContext } from '../tenancy/context.js';

/** Build the middleware from an injected validator (used directly in tests). */
export function createTenantMiddleware(validator: MembershipValidator): RequestHandler {
  return (req, _res, next) => {
    const auth = req.auth;
    if (auth === undefined) {
      next();
      return;
    }
    validator
      .isActiveMember(auth.organizationId, auth.userId)
      .then((isMember) => {
        if (!isMember) {
          next(AppError.forbidden('You are not an active member of this organization.'));
          return;
        }
        const ctx: TenantContext = {
          organizationId: auth.organizationId,
          userId: auth.userId,
          role: auth.role,
          isSuperAdmin: auth.isSuperAdmin,
        };
        // als.run wraps next() so the whole downstream handler chain (and its awaited
        // continuations, captured at schedule time) sees this tenant context.
        runWithTenantContext(ctx, () => next());
      })
      .catch(next);
  };
}

// Production cache adapter over ioredis (keeps the validator decoupled from ioredis overloads).
const redisMembershipCache: MembershipCache = {
  get: (key) => cacheRedis.get(key),
  setWithTtl: async (key, value, ttlSeconds) => {
    await cacheRedis.set(key, value, 'EX', ttlSeconds);
  },
};

export const tenantMiddleware: RequestHandler = createTenantMiddleware(
  new CachedMembershipValidator(redisMembershipCache, prismaMembershipLookup),
);
