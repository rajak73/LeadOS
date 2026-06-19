// Unit tests for the cached membership validator (no DB / no Redis — fakes injected).

import { describe, it, expect, vi } from 'vitest';
import {
  CachedMembershipValidator,
  membershipCacheKey,
  type MembershipCache,
} from './membership.js';

function fakeCache(initial: Record<string, string> = {}): MembershipCache & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial));
  return {
    store,
    get: (key) => Promise.resolve(store.get(key) ?? null),
    setWithTtl: (key, value) => {
      store.set(key, value);
      return Promise.resolve();
    },
  };
}

const ORG = 'org-1';
const USER = 'user-1';

describe('CachedMembershipValidator', () => {
  it('returns true on a cache hit without hitting the DB', async () => {
    const cache = fakeCache({ [membershipCacheKey(ORG, USER)]: '1' });
    const lookup = vi.fn().mockResolvedValue(false);
    const v = new CachedMembershipValidator(cache, lookup);

    expect(await v.isActiveMember(ORG, USER)).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('falls through to the DB on a cache miss and caches a positive result', async () => {
    const cache = fakeCache();
    const lookup = vi.fn().mockResolvedValue(true);
    const v = new CachedMembershipValidator(cache, lookup);

    expect(await v.isActiveMember(ORG, USER)).toBe(true);
    expect(lookup).toHaveBeenCalledWith(ORG, USER);
    expect(cache.store.get(membershipCacheKey(ORG, USER))).toBe('1');
  });

  it('does NOT cache a negative result (so a just-added member is not locked out)', async () => {
    const cache = fakeCache();
    const lookup = vi.fn().mockResolvedValue(false);
    const v = new CachedMembershipValidator(cache, lookup);

    expect(await v.isActiveMember(ORG, USER)).toBe(false);
    expect(cache.store.has(membershipCacheKey(ORG, USER))).toBe(false);
  });

  it('falls through to the DB when the cache read throws (Redis blip)', async () => {
    const cache: MembershipCache = {
      get: () => Promise.reject(new Error('redis down')),
      setWithTtl: () => Promise.reject(new Error('redis down')),
    };
    const lookup = vi.fn().mockResolvedValue(true);
    const v = new CachedMembershipValidator(cache, lookup);

    expect(await v.isActiveMember(ORG, USER)).toBe(true);
    expect(lookup).toHaveBeenCalledOnce();
  });
});
