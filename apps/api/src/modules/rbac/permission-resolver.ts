// RBAC-2.1 — DB-backed, cached permission resolution.
//
// Resolves the member's CURRENT role + effective permissions from the database (so a role
// change is reflected as soon as the cache is invalidated — not when the token rotates), with a
// short-lived Redis cache. The DB read runs org-scoped through withTenant (the org is known
// from the auth context, so this respects D-M3-2 — no cross-tenant discovery).
//
// Permission source: the role's permission rows (authoritative, supports custom roles); for a
// system role with no seeded rows we fall back to the shared ROLE_PERMISSIONS map.

import { ROLE_PERMISSIONS, type SystemRole } from '@leados/shared';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import type { PermissionResolver, ResolvedPermissions } from '../../core/authz/permission-check.js';

/** Minimal cache surface (subset of ioredis) with delete — so tests can supply a fake. */
export interface RbacCache {
  get(key: string): Promise<string | null>;
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

export type PermissionLookup = (
  organizationId: string,
  userId: string,
) => Promise<ResolvedPermissions | null>;

export function permissionCacheKey(organizationId: string, userId: string): string {
  return `tenant:perms:${organizationId}:${userId}`;
}

/** Production lookup: the member's ACTIVE role + permissions, read org-scoped via withTenant. */
export const prismaPermissionLookup: PermissionLookup = (organizationId, userId) =>
  withTenant(organizationId, async (db) => {
    const member = await db.organizationMember.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { role: { select: { name: true, permissions: { select: { resource: true, action: true } } } } },
    });
    if (member === null) return null;
    const fromRows = new Set(member.role.permissions.map((p) => `${p.resource}.${p.action}`));
    const permissions =
      fromRows.size > 0
        ? fromRows
        : new Set<string>(ROLE_PERMISSIONS[member.role.name as SystemRole] ?? []);
    return { roleName: member.role.name, permissions };
  });

function serialize(resolved: ResolvedPermissions): string {
  return JSON.stringify({ roleName: resolved.roleName, permissions: [...resolved.permissions] });
}
function deserialize(raw: string): ResolvedPermissions {
  const parsed = JSON.parse(raw) as { roleName: string; permissions: string[] };
  return { roleName: parsed.roleName, permissions: new Set(parsed.permissions) };
}

export class CachedPermissionResolver implements PermissionResolver {
  constructor(
    private readonly cache: RbacCache,
    private readonly lookup: PermissionLookup,
    private readonly ttlSeconds = 300,
  ) {}

  async resolve(organizationId: string, userId: string): Promise<ResolvedPermissions | null> {
    const key = permissionCacheKey(organizationId, userId);
    try {
      const cached = await this.cache.get(key);
      if (cached !== null) return deserialize(cached);
    } catch {
      /* cache miss/blip → fall through to DB */
    }

    const resolved = await this.lookup(organizationId, userId);
    if (resolved !== null) {
      try {
        await this.cache.setWithTtl(key, serialize(resolved), this.ttlSeconds);
      } catch {
        /* best-effort cache write */
      }
    }
    return resolved;
  }

  async invalidate(organizationId: string, userId: string): Promise<void> {
    try {
      await this.cache.del(permissionCacheKey(organizationId, userId));
    } catch {
      /* best-effort */
    }
  }
}
