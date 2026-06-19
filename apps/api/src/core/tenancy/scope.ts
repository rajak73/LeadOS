// TEN-3.2.3 — tenant-scope tracking + guard.
//
// withTenant() runs its callback inside a tenant scope (AsyncLocalStorage). The tenant data
// layer (TenantRepository, TEN-3.2.1) calls assertTenantScope() so it CANNOT be used outside a
// withTenant() unit of work — closing the "tenant-model access outside tenant scope" hole.
//
// Pre-tenant / cross-tenant IDENTITY operations (org bootstrap, login membership discovery,
// opaque refresh-token lookup) legitimately touch tenant tables on the raw client before a
// tenant context exists; those are the documented exceptions and do NOT go through the tenant
// repository (so they never trip this guard).

import { AsyncLocalStorage } from 'node:async_hooks';

export class TenantScopeViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeViolationError';
  }
}

interface TenantScope {
  organizationId: string;
}

const scopeStorage = new AsyncLocalStorage<TenantScope>();

/** Run `fn` (and its awaited continuations) inside the tenant scope for `organizationId`. */
export function runInTenantScope<T>(organizationId: string, fn: () => T): T {
  return scopeStorage.run({ organizationId }, fn);
}

/** True when executing inside a withTenant() unit of work. */
export function isInTenantScope(): boolean {
  return scopeStorage.getStore() !== undefined;
}

/** The active scope's organizationId, or undefined outside any tenant scope. */
export function currentTenantOrganizationId(): string | undefined {
  return scopeStorage.getStore()?.organizationId;
}

/** Throw unless called inside a withTenant() scope. The TEN-3.2.3 guard. */
export function assertTenantScope(): void {
  if (scopeStorage.getStore() === undefined) {
    throw new TenantScopeViolationError(
      'Tenant data layer used outside a withTenant() scope. Wrap tenant-model access in ' +
        'withTenant(organizationId, (db) => …).',
    );
  }
}
