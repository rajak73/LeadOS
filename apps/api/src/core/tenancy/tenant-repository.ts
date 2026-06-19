// TEN-3.2.1 — Tenant repository base.
//
// The sanctioned base for org-scoped repositories. It receives the tenant-scoped client from
// withTenant() and asserts (at construction) that it is being used inside a tenant scope
// (TEN-3.2.3 guard) — so a tenant repository can never run unscoped. Subclasses never handle
// organizationId: the tenant extension injects it on every operation, and `WithoutTenant<T>`
// removes it from create inputs at the type level (resolving the M2 DX gap TD-M2-1 — the
// `organizationId`-stripping cast lives once here, not scattered across call sites).

import { assertTenantScope } from './scope.js';
import type { TenantTransactionClient } from './with-tenant.js';

/**
 * A Prisma create input with the tenant FK removed — callers supply everything EXCEPT
 * `organizationId`/`organization`, which the tenant extension fills in.
 */
export type WithoutTenant<T> = Omit<T, 'organizationId' | 'organization'>;

/** Re-cast an org-free input to the full Prisma input (the extension supplies the tenant FK). */
export function asTenantCreate<T>(data: WithoutTenant<T>): T {
  return data as unknown as T;
}

export abstract class TenantRepository {
  protected readonly db: TenantTransactionClient;

  constructor(db: TenantTransactionClient) {
    assertTenantScope();
    this.db = db;
  }
}
