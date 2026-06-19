// TEN-2.3 — Request-scoped tenant context via AsyncLocalStorage.
//
// tenantMiddleware (TEN-2.4) populates this for the lifetime of an authenticated request so
// services/repositories can read the active tenant without threading it through every call.
// `permissions` / `ownOnly` are reserved for RBAC (Milestone 4) and are unset in M2.

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  organizationId: string;
  userId: string;
  role: string;
  isSuperAdmin: boolean;
  /** Caller IP, captured by tenantMiddleware for audit snapshots (AUD-2). */
  ipAddress?: string;
  /** Effective permission keys — populated by RBAC in Milestone 4. */
  permissions?: readonly string[];
  /** True when the caller holds only `*_own` permissions — populated in Milestone 4. */
  ownOnly?: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Run `fn` (and everything it awaits) with `ctx` as the active tenant context. */
export function runWithTenantContext<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The active tenant context, or undefined on non-tenant (public/unauthenticated) paths. */
export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

/** The active tenant context, or throw if called outside a tenant scope. */
export function requireTenantContext(): TenantContext {
  const ctx = storage.getStore();
  if (ctx === undefined) {
    throw new Error('No tenant context: requireTenantContext() called outside a tenant scope.');
  }
  return ctx;
}
