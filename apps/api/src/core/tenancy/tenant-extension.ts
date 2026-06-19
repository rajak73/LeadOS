// TEN-2.2 — Tenant Prisma client extension (FINAL_ARCHITECTURE §2.1).
//
// A query extension bound to a single organizationId that injects the tenant column on EVERY
// operation against a tenant model — deny-by-default: any model operation it cannot scope is
// rejected (it never silently runs unscoped). It is the APP-LAYER half of the defense; RLS
// (Sprint 3 M1) is the database backstop beneath it.
//
// `injectTenant` is a pure function so the full operation matrix is unit-testable without a
// database; `tenantExtension` is the thin Prisma wrapper around it.

import { Prisma } from '@prisma/client';
import { TENANT_COLUMN, TENANT_RELATION, isTenantModel } from './tenant-tables.js';

/** Thrown when a tenant model is hit by an operation that cannot be tenant-scoped. */
export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

type Args = Record<string, unknown>;

// Read/delete operations whose tenant scope is expressed by merging the tenant column into
// `where`. (Writes — create*/update*/upsert — are handled explicitly so their DATA is pinned
// too; see DEF-M2-1.) findUnique/delete rely on Prisma 5 extendedWhereUnique for the filter.
const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** Merge the tenant column into a `where`/data object; ours wins, so callers can't override it. */
function withTenantColumn(value: unknown, organizationId: string): Args {
  const base = (value as Args | undefined) ?? {};
  return { ...base, [TENANT_COLUMN]: organizationId };
}

/** Remove the `organization` RELATION key — a second reassignment vector alongside the scalar. */
function stripTenantRelation(base: Args): Args {
  if (TENANT_RELATION in base) {
    delete base[TENANT_RELATION];
  }
  return base;
}

/**
 * CREATE-side data: the row is born into the active tenant. Strip any `organization` relation
 * and force `organizationId` to the active org (overriding anything the caller supplied).
 */
function forceTenantOnCreate(value: unknown, organizationId: string): Args {
  const base = stripTenantRelation({ ...((value as Args | undefined) ?? {}) });
  base[TENANT_COLUMN] = organizationId;
  return base;
}

/**
 * UPDATE-side data: the row already belongs to the active tenant (the `where` is scoped). Pin it
 * so an update cannot REASSIGN it — strip the `organization` relation and, if the caller tries to
 * set `organizationId`, override it back to the active org. Benign updates are left untouched
 * (we do not add the column when no reassignment is attempted).
 */
function pinTenantOnUpdate(value: unknown, organizationId: string): Args {
  const base = stripTenantRelation({ ...((value as Args | undefined) ?? {}) });
  if (TENANT_COLUMN in base) {
    base[TENANT_COLUMN] = organizationId;
  }
  return base;
}

/**
 * Return a tenant-scoped copy of `args` for `operation`, or throw TenantScopeError if the
 * operation cannot be scoped (deny-by-default). Pure — no Prisma, no I/O.
 */
export function injectTenant(operation: string, args: unknown, organizationId: string): Args {
  const a: Args = { ...((args as Args | undefined) ?? {}) };

  switch (operation) {
    case 'create':
      a.data = forceTenantOnCreate(a.data, organizationId);
      return a;

    case 'createMany':
    case 'createManyAndReturn': {
      const rows = Array.isArray(a.data) ? (a.data as unknown[]) : [a.data];
      a.data = rows.map((row) => forceTenantOnCreate(row, organizationId));
      return a;
    }

    case 'update':
    case 'updateMany':
      a.where = withTenantColumn(a.where, organizationId);
      if (a.data !== undefined) {
        a.data = pinTenantOnUpdate(a.data, organizationId);
      }
      return a;

    case 'upsert':
      a.where = withTenantColumn(a.where, organizationId);
      a.create = forceTenantOnCreate(a.create, organizationId);
      a.update = pinTenantOnUpdate(a.update, organizationId);
      return a;

    default:
      if (WHERE_OPS.has(operation)) {
        a.where = withTenantColumn(a.where, organizationId);
        return a;
      }
      throw new TenantScopeError(
        `Operation "${operation}" on a tenant model cannot be tenant-scoped (deny-by-default).`,
      );
  }
}

/** Prisma extension that scopes every tenant-model operation to `organizationId`. */
export function tenantExtension(organizationId: string) {
  return Prisma.defineExtension({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!isTenantModel(model)) {
            return query(args);
          }
          return query(injectTenant(operation, args, organizationId) as typeof args);
        },
      },
    },
  });
}
