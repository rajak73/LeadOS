// Unit tests for the cached permission resolver (no DB — fake cache + fake lookup).
// Verifies caching AND invalidation deterministically (independent of Redis availability).

import { describe, it, expect, vi } from 'vitest';
import {
  CachedPermissionResolver,
  permissionCacheKey,
  type RbacCache,
} from './permission-resolver.js';
import type { ResolvedPermissions } from '../../core/authz/permission-check.js';

function fakeCache(): RbacCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: (k) => Promise.resolve(store.get(k) ?? null),
    setWithTtl: (k, v) => {
      store.set(k, v);
      return Promise.resolve();
    },
    del: (k) => {
      store.delete(k);
      return Promise.resolve();
    },
  };
}

const OWNER: ResolvedPermissions = { roleName: 'OWNER', permissions: new Set(['org.read', 'team.read']) };

describe('CachedPermissionResolver', () => {
  it('resolves via the DB on a miss and caches the result', async () => {
    const cache = fakeCache();
    const lookup = vi.fn().mockResolvedValue(OWNER);
    const r = new CachedPermissionResolver(cache, lookup);

    const first = await r.resolve('o1', 'u1');
    expect(first?.roleName).toBe('OWNER');
    expect([...(first?.permissions ?? [])]).toContain('org.read');
    expect(lookup).toHaveBeenCalledOnce();
    expect(cache.store.has(permissionCacheKey('o1', 'u1'))).toBe(true);
  });

  it('serves a second call from cache (no second DB lookup)', async () => {
    const cache = fakeCache();
    const lookup = vi.fn().mockResolvedValue(OWNER);
    const r = new CachedPermissionResolver(cache, lookup);

    await r.resolve('o1', 'u1');
    const second = await r.resolve('o1', 'u1');
    expect(second?.permissions.has('team.read')).toBe(true);
    expect(lookup).toHaveBeenCalledOnce(); // still once
  });

  it('invalidate() forces a fresh DB lookup on the next resolve (RBAC-2.4)', async () => {
    const cache = fakeCache();
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(OWNER)
      .mockResolvedValueOnce({ roleName: 'SALES_EXECUTIVE', permissions: new Set(['org.read']) });
    const r = new CachedPermissionResolver(cache, lookup);

    await r.resolve('o1', 'u1'); // caches OWNER
    await r.invalidate('o1', 'u1'); // purge
    const after = await r.resolve('o1', 'u1'); // re-reads
    expect(after?.roleName).toBe('SALES_EXECUTIVE');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('returns null and does not cache when the member is not active', async () => {
    const cache = fakeCache();
    const lookup = vi.fn().mockResolvedValue(null);
    const r = new CachedPermissionResolver(cache, lookup);

    expect(await r.resolve('o1', 'u1')).toBeNull();
    expect(cache.store.size).toBe(0);
  });
});
