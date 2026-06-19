// Tenant-table registry (TEN-3.1.3) — the single source of truth for which tables are
// organization-scoped. It drives (a) the RLS policies (migration 0003), (b) the RLS-coverage
// check (scripts/check-rls-coverage.ts), and later (Sprint 3 M2) the tenant Prisma extension.
//
// INVARIANT enforced in CI: this registry MUST equal the set of tables that physically carry
// the tenant column. A new org-scoped table that is added to the schema but not here (or
// vice-versa) fails the coverage check — so no tenant table can silently ship without RLS.
//
// NOTE on the column name: the architecture (FINAL_ARCHITECTURE §2) writes the tenant key as
// `organization_id` illustratively; the actual Prisma-generated column is camelCase
// `"organizationId"`. Policies + checks use the real column name below.

/** The physical column carrying the owning organization id on every tenant table. */
export const TENANT_COLUMN = 'organizationId' as const;

/** The Postgres GUC that pins the active organization for a unit of work (set via SET LOCAL). */
export const TENANT_GUC = 'app.current_organization_id' as const;

/**
 * Org-scoped tables. RLS (enable + force + missing-safe policy) must cover exactly this set.
 * Identity roots (`users`, `organizations`) and cross-tenant infra (`verification_tokens`,
 * `health_check`) are intentionally NOT tenant-scoped and carry no `organizationId`.
 */
export const TENANT_TABLES = [
  'organization_members',
  'roles',
  'subscriptions',
  'refresh_tokens',
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

/** Tables that intentionally have no tenant column (documented exclusions). */
export const NON_TENANT_TABLES = [
  'users',
  'organizations',
  'verification_tokens',
  'permissions',
  'health_check',
] as const;

export function isTenantTable(table: string): table is TenantTable {
  return (TENANT_TABLES as readonly string[]).includes(table);
}
