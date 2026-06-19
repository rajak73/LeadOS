// Sprint 3 M2 / TEN-2.1 + TEN-2.2 — withTenant + tenant extension, end-to-end vs real DB.
//
// Runs over the ADMIN connection (the runtime is not yet switched to leados_app — D2). The
// admin role BYPASSes RLS, so isolation here is provided purely by the APP-LAYER extension —
// which is exactly what this milestone adds. (M1 already proved the RLS database backstop.)
// DB-gated; executes in CI via the DEF-3 guard.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { withTenant } from '../../src/core/tenancy/with-tenant.js';
import { TenantScopeError } from '../../src/core/tenancy/tenant-extension.js';

const pgUp = await isPostgresUp();

// The extension supplies organizationId at runtime, but Prisma's generated create input still
// requires it at the type level. Until the M3 tenant-repository layer exposes org-free
// signatures, callers cast away the organizationId requirement (documented DX finding D-M2-1).
const orgFreeRole = (name: string): Prisma.RoleUncheckedCreateInput =>
  ({ name, isSystem: false }) as unknown as Prisma.RoleUncheckedCreateInput;

let orgA = '';
let orgB = '';

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();
  const [a] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `wt A ${nonce}`,
    `wt-a-${nonce}`,
  );
  const [b] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `wt B ${nonce}`,
    `wt-b-${nonce}`,
  );
  orgA = a!.id;
  orgB = b!.id;
  await prisma.$executeRawUnsafe(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'OWNER', true, now()),
              (uuid_generate_v4(), $1::uuid, 'ADMIN', true, now())`,
    orgA,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'OWNER', true, now())`,
    orgB,
  );
});

afterAll(async () => {
  if (pgUp && orgA && orgB) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM roles WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
      orgA,
      orgB,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid)`,
      orgA,
      orgB,
    );
  }
});

describe.skipIf(!pgUp)('withTenant + tenant extension (app-layer isolation)', () => {
  it('scopes reads to the active org (findMany / count)', async () => {
    const { rows, count } = await withTenant(orgA, async (db) => ({
      rows: await db.role.findMany(),
      count: await db.role.count(),
    }));
    expect(count).toBe(2);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('a caller cannot escape their tenant by passing another org in where', async () => {
    // Ask for org B's rows while scoped to org A → extension overrides → org A's rows only.
    const rows = await withTenant(orgA, (db) =>
      db.role.findMany({ where: { organizationId: orgB } }),
    );
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.length).toBe(2);
  });

  it('auto-injects organizationId on create (no need to pass it)', async () => {
    const created = await withTenant(orgA, (db) =>
      db.role.create({ data: orgFreeRole('M2-CREATE') }),
    );
    expect(created.organizationId).toBe(orgA);
    await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE id = $1::uuid`, created.id);
  });

  it('cross-org writes can never reach another org (extension forces the active tenant)', async () => {
    const before = await withTenant(orgB, (db) => db.role.count());
    // From org A's context, explicitly try to mutate then delete org B's rows. The extension
    // rewrites organizationId → org A, so these operations can only ever touch org A's own
    // rows; org B is structurally unreachable.
    await withTenant(orgA, (db) =>
      db.role.updateMany({ where: { organizationId: orgB }, data: { isSystem: false } }),
    );
    await withTenant(orgA, (db) => db.role.deleteMany({ where: { organizationId: orgB } }));
    const after = await withTenant(orgB, (db) => db.role.count());
    expect(after).toBe(before); // org B untouched (still its original row count)
    expect(after).toBe(1);
  });

  it('runs the body inside a single transaction (rolls back on throw)', async () => {
    await expect(
      withTenant(orgA, async (db) => {
        await db.role.create({ data: orgFreeRole('ROLLBACK-ME') });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const leftover = await withTenant(orgA, (db) =>
      db.role.count({ where: { name: 'ROLLBACK-ME' } }),
    );
    expect(leftover).toBe(0);
  });

  it('non-tenant models are unaffected by the extension (organizations readable)', async () => {
    const org = await withTenant(orgA, (db) => db.organization.findUnique({ where: { id: orgB } }));
    expect(org?.id).toBe(orgB); // organizations is not tenant-scoped → cross-org lookup allowed
  });
});

describe('TenantScopeError export', () => {
  it('is an Error subclass', () => {
    expect(new TenantScopeError('x')).toBeInstanceOf(Error);
  });
});
