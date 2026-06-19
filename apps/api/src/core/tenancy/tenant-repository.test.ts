// Unit tests for the tenant repository base guard (no DB).

import { describe, it, expect } from 'vitest';
import { TenantRepository, asTenantCreate } from './tenant-repository.js';
import { runInTenantScope, TenantScopeViolationError } from './scope.js';
import type { TenantTransactionClient } from './with-tenant.js';

// A concrete repo for the test; the db is never touched (we only exercise the scope guard).
class TestRepo extends TenantRepository {
  ok(): boolean {
    return this.db !== undefined;
  }
}

const fakeDb = {} as TenantTransactionClient;

describe('TenantRepository (TEN-3.2.3 guard)', () => {
  it('throws when constructed OUTSIDE a withTenant scope', () => {
    expect(() => new TestRepo(fakeDb)).toThrow(TenantScopeViolationError);
  });

  it('constructs INSIDE a tenant scope', () => {
    const repo = runInTenantScope('org-1', () => new TestRepo(fakeDb));
    expect(repo.ok()).toBe(true);
  });
});

describe('asTenantCreate', () => {
  it('passes the org-free input through (the extension supplies the tenant FK)', () => {
    const data = { name: 'x' };
    expect(asTenantCreate<{ name: string; organizationId: string }>(data)).toBe(data);
  });
});
