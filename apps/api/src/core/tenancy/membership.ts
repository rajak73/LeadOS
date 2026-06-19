// Membership validation for tenantMiddleware (FINAL_ARCHITECTURE §2.4).
//
// Confirms the authenticated user has an ACTIVE membership in the claimed organization, with a
// short-lived positive cache (default 5 min). Structured for testability: the cache and the DB
// lookup are injected, so the cache logic is unit-tested with fakes while the production wiring
// uses Redis + a withTenant-scoped query.
//
// NOTE: only POSITIVE results are cached (a confirmed member). Negatives are re-checked each
// time so a just-added member is never locked out by a stale "no". Active cache invalidation on
// suspend/remove/role-change (the ≤TTL staleness window) is RBAC-2.4 in Milestone 4.

import { withTenant } from './with-tenant.js';

export interface MembershipValidator {
  isActiveMember(organizationId: string, userId: string): Promise<boolean>;
}

/** Minimal cache surface (a subset of ioredis) so tests can supply a fake. */
export interface MembershipCache {
  get(key: string): Promise<string | null>;
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** The database membership check. Separated from the cache so it can be swapped in tests. */
export type MembershipLookup = (organizationId: string, userId: string) => Promise<boolean>;

export function membershipCacheKey(organizationId: string, userId: string): string {
  return `tenant:member:${organizationId}:${userId}`;
}

/** The production lookup: an ACTIVE membership row, read through a tenant-scoped unit of work. */
export const prismaMembershipLookup: MembershipLookup = (organizationId, userId) =>
  withTenant(organizationId, (db) =>
    db.organizationMember
      .findFirst({ where: { userId, status: 'ACTIVE' }, select: { id: true } })
      .then((row) => row !== null),
  );

export class CachedMembershipValidator implements MembershipValidator {
  constructor(
    private readonly cache: MembershipCache,
    private readonly lookup: MembershipLookup,
    private readonly ttlSeconds = 300,
  ) {}

  async isActiveMember(organizationId: string, userId: string): Promise<boolean> {
    const key = membershipCacheKey(organizationId, userId);

    // Cache is best-effort: a Redis blip must not deny a legitimate member, so fall through
    // to the DB on any cache error.
    try {
      if ((await this.cache.get(key)) === '1') {
        return true;
      }
    } catch {
      /* ignore cache read errors */
    }

    const ok = await this.lookup(organizationId, userId);

    if (ok) {
      try {
        await this.cache.setWithTtl(key, '1', this.ttlSeconds);
      } catch {
        /* ignore cache write errors */
      }
    }
    return ok;
  }
}
