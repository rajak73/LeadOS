// TEN-2.1 — Unit-of-work helper (FINAL_ARCHITECTURE §2.1).
//
// withTenant runs `fn` inside ONE interactive transaction whose FIRST statement pins the
// tenant GUC via `set_config('app.current_organization_id', orgId, true)` (SET LOCAL — same
// connection, reverted at commit/rollback), exposing a tenant-scoped client (the tenant
// extension is applied) to `fn`. This is the only sanctioned way to touch tenant models.
//
// NOTE (Sprint 3 M2, D2 sequencing): the runtime still connects via the admin `prisma`
// singleton — RLS is bypassed by that role, so the EXTENSION provides isolation here; once
// the connection is switched to `leados_app` (a later milestone, after all writes are wrapped)
// the GUC + RLS additionally enforce at the database layer. The mechanism is identical either
// way; only the backstop turns on.

import { prisma } from '../prisma/client.js';
import { TENANT_GUC } from './tenant-tables.js';
import { tenantExtension } from './tenant-extension.js';
import { runInTenantScope } from './scope.js';

function buildTenantClient(organizationId: string) {
  return prisma.$extends(tenantExtension(organizationId));
}

/** A tenant-scoped Prisma client (extension applied). */
export type TenantClient = ReturnType<typeof buildTenantClient>;

/** The transaction-bound form of {@link TenantClient} handed to a withTenant callback. */
export type TenantTransactionClient = Parameters<
  Parameters<TenantClient['$transaction']>[0]
>[0];

export async function withTenant<T>(
  organizationId: string,
  fn: (db: TenantTransactionClient) => Promise<T>,
): Promise<T> {
  const client = buildTenantClient(organizationId);
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('${TENANT_GUC}', $1, true)`, organizationId);
    // Mark the tenant scope so the data layer's guard (assertTenantScope) passes inside the
    // unit of work and rejects tenant-repository use anywhere else.
    return runInTenantScope(organizationId, () => fn(tx));
  });
}
