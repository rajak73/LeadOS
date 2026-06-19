// RBAC module public surface + composition root. app.ts imports ONLY from here.
// Wires the Redis-cached permission resolver, the real requirePermission guard, the role-admin
// router, and the active cache invalidator (RBAC-2.4: purges BOTH the permission and the M2
// membership cache so role changes / suspensions take effect on the next request).

import { Router, type RequestHandler } from 'express';
import { cacheRedis } from '../../core/redis/client.js';
import { createRequirePermission } from '../../core/middleware/rbac.middleware.js';
import { membershipCacheKey } from '../../core/tenancy/membership.js';
import { PrismaAuditRecorder } from '../../core/audit/audit-recorder.js';
import type { PermissionResolver } from '../../core/authz/permission-check.js';
import {
  CachedPermissionResolver,
  prismaPermissionLookup,
  type RbacCache,
} from './permission-resolver.js';
import { PrismaRbacRepository } from './rbac.repository.js';
import { RbacService, type MemberInvalidator } from './rbac.service.js';
import { createRbacController } from './rbac.controller.js';
import { buildRbacRouter } from './rbac.routes.js';

const redisRbacCache: RbacCache = {
  get: (key) => cacheRedis.get(key),
  setWithTtl: async (key, value, ttl) => {
    await cacheRedis.set(key, value, 'EX', ttl);
  },
  del: async (key) => {
    await cacheRedis.del(key);
  },
};

/** Purge a member's permission cache AND their M2 membership cache (RBAC-2.4). */
export function createMemberInvalidator(
  resolver: PermissionResolver,
  cache: RbacCache,
): MemberInvalidator {
  return {
    async invalidate(organizationId, userId) {
      await resolver.invalidate(organizationId, userId);
      try {
        await cache.del(membershipCacheKey(organizationId, userId));
      } catch {
        /* best-effort */
      }
    },
  };
}

export interface RbacModule {
  router: Router;
  requirePermission: (permission: string) => RequestHandler;
  resolver: PermissionResolver;
}

export function buildRbacModule(): RbacModule {
  const resolver = new CachedPermissionResolver(redisRbacCache, prismaPermissionLookup);
  const requirePermission = createRequirePermission(resolver);
  const invalidator = createMemberInvalidator(resolver, redisRbacCache);
  const service = new RbacService(new PrismaRbacRepository(), invalidator, new PrismaAuditRecorder());
  const controller = createRbacController(service);
  const router = buildRbacRouter(controller, requirePermission);
  return { router, requirePermission, resolver };
}
