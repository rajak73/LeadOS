// RBAC-2.2 — real permission enforcement (replaces the Sprint 1 stub).
//
// createRequirePermission(resolver) builds the `requirePermission(key)` guard used on
// authenticated routes. It runs AFTER authMiddleware + tenantMiddleware, so req.auth and the
// tenant context are set. It resolves the member's CURRENT permissions (from the DB-backed,
// cached resolver — so a role change takes effect on the next request once the cache is
// invalidated, regardless of the token's stale role claim), enforces the required permission,
// and records `ownOnly` / `permissions` on the tenant context for downstream filtering.

import type { RequestHandler } from 'express';
import { asyncHandler } from '../http/async-handler.js';
import { AppError } from '../errors/app-error.js';
import { getTenantContext } from '../tenancy/context.js';
import { decide, type PermissionResolver } from '../authz/permission-check.js';

// `permission` is a string (not PermissionKey): the catalog includes admin keys such as
// `team.update_role` / `team.suspend` that do not fit the generic ${Resource}.${Action} shape.
export function createRequirePermission(
  resolver: PermissionResolver,
): (permission: string) => RequestHandler {
  return (permission) =>
    asyncHandler(async (req, _res, next) => {
      const auth = req.auth;
      if (auth === undefined) {
        next(AppError.unauthorized('Authentication required'));
        return;
      }

      const ctx = getTenantContext();

      // Platform super admins bypass org permission checks (they still had to pass the tenant
      // membership gate to get here).
      if (auth.isSuperAdmin) {
        if (ctx) ctx.ownOnly = false;
        next();
        return;
      }

      const resolved = await resolver.resolve(auth.organizationId, auth.userId);
      if (resolved === null) {
        next(AppError.forbidden('No active membership in this organization.'));
        return;
      }

      const decision = decide(permission, resolved.permissions);
      if (!decision.allowed) {
        next(AppError.forbidden(`Missing permission: ${permission}`));
        return;
      }

      if (ctx) {
        ctx.permissions = [...resolved.permissions];
        ctx.ownOnly = decision.ownOnly;
      }
      next();
    });
}
