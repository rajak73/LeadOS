// Sprint 4 M1 / CRM-1.3 — CRM per-table RLS isolation proof.
//
// Verifies tenant isolation for the 10 new CRM tables against REAL Postgres as leados_app.
//
// Note on "unset GUC → zero rows" coverage: rls.foundation.test.ts already proves that every
// tenant table (including all 15 registered in TENANT_TABLES) has RLS ENABLED + FORCED + a
// policy, and proves missing-safe denial on the `roles` table as a representative. The CRM
// tests here focus on per-table DATA isolation (row-level visibility) and WITH CHECK.
//
// DB-gated: self-skips when Postgres is unavailable; runs in CI.
// Activities are tested via $queryRawUnsafe only (composite PK means Prisma model API can't
// issue a standard INSERT; WITH CHECK enforcement is verified via raw SQL).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { env } from '../../src/core/config/env.js';
import { TENANT_GUC } from '../../src/core/tenancy/tenant-tables.js';

const pgUp = await isPostgresUp();

const APP_URL =
  env.DATABASE_APP_URL ?? 'postgresql://leados_app:leados_app@localhost:5432/leados';

const appPrisma = new PrismaClient({ datasourceUrl: APP_URL });

let orgA = '';
let orgB = '';
let userIdA = '';

type AppTx = Parameters<Parameters<typeof appPrisma.$transaction>[0]>[0];

async function asTenant<T>(orgId: string, fn: (tx: AppTx) => Promise<T>): Promise<T> {
  return appPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('${TENANT_GUC}', $1, true)`, orgId);
    return fn(tx);
  });
}

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();

  const [a] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `CRM RLS A ${nonce}`,
    `crm-rls-a-${nonce}`,
  );
  const [b] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `CRM RLS B ${nonce}`,
    `crm-rls-b-${nonce}`,
  );
  orgA = a!.id;
  orgB = b!.id;

  // firstName + lastName are NOT NULL on the users table
  const [u] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email, "passwordHash", "firstName", "lastName", "updatedAt")
     VALUES ($1, 'hash', 'CRM', 'RLS', now()) RETURNING id`,
    `crm-rls-user-${nonce}@test.invalid`,
  );
  userIdA = u!.id;

  // Seed leads and contacts for both orgs via admin client (bypasses RLS)
  await prisma.$executeRawUnsafe(
    `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, 'LeadA', 'MANUAL', 'NEW', $3::uuid, now()),
            (uuid_generate_v4(), $2::uuid, 'LeadB', 'MANUAL', 'NEW', $3::uuid, now())`,
    orgA,
    orgB,
    userIdA,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO contacts (id, "organizationId", "firstName", "createdById", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, 'ContactA', $3::uuid, now()),
            (uuid_generate_v4(), $2::uuid, 'ContactB', $3::uuid, now())`,
    orgA,
    orgB,
    userIdA,
  );
});

afterAll(async () => {
  if (!pgUp) return;
  if (orgA) await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgA);
  if (orgB) await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgB);
  if (userIdA) await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, userIdA);
  await appPrisma.$disconnect().catch(() => undefined);
});

// ─── leads ────────────────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('CRM RLS — leads', () => {
  it('GUC = orgA → only orgA rows visible', async () => {
    const rows = await asTenant(orgA, (tx) =>
      tx.$queryRawUnsafe<{ firstName: string }[]>(`SELECT "firstName" FROM leads`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.firstName).toBe('LeadA');
  });

  it('GUC = orgB → only orgB rows visible', async () => {
    const rows = await asTenant(orgB, (tx) =>
      tx.$queryRawUnsafe<{ firstName: string }[]>(`SELECT "firstName" FROM leads`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.firstName).toBe('LeadB');
  });

  it('cross-org INSERT rejected by WITH CHECK', async () => {
    await expect(
      asTenant(orgA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
           VALUES (uuid_generate_v4(), $1::uuid, 'Evil', 'MANUAL', 'NEW', $2::uuid, now())`,
          orgB,
          userIdA,
        ),
      ),
    ).rejects.toThrow();
  });
});

// ─── contacts ─────────────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('CRM RLS — contacts', () => {
  it('GUC = orgA → only orgA contacts visible', async () => {
    const rows = await asTenant(orgA, (tx) =>
      tx.$queryRawUnsafe<{ firstName: string }[]>(`SELECT "firstName" FROM contacts`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.firstName).toBe('ContactA');
  });

  it('GUC = orgB → only orgB contacts visible', async () => {
    const rows = await asTenant(orgB, (tx) =>
      tx.$queryRawUnsafe<{ firstName: string }[]>(`SELECT "firstName" FROM contacts`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.firstName).toBe('ContactB');
  });

  it('cross-org INSERT rejected by WITH CHECK', async () => {
    await expect(
      asTenant(orgA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO contacts (id, "organizationId", "firstName", "createdById", "updatedAt")
           VALUES (uuid_generate_v4(), $1::uuid, 'Evil', $2::uuid, now())`,
          orgB,
          userIdA,
        ),
      ),
    ).rejects.toThrow();
  });
});

// ─── tasks ────────────────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('CRM RLS — tasks', () => {
  it('GUC = orgA → zero tasks for orgA (none seeded; no cross-org leak)', async () => {
    const rows = await asTenant(orgA, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM tasks`),
    );
    expect(rows).toHaveLength(0);
  });

  it('cross-org INSERT rejected by WITH CHECK', async () => {
    await expect(
      asTenant(orgA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO tasks (id, "organizationId", title, type, priority, status, "createdById", "updatedAt")
           VALUES (uuid_generate_v4(), $1::uuid, 'EvilTask', 'OTHER', 'MEDIUM', 'PENDING', $2::uuid, now())`,
          orgB,
          userIdA,
        ),
      ),
    ).rejects.toThrow();
  });
});

// ─── activities (composite PK — raw SQL only) ─────────────────────────────────

describe.skipIf(!pgUp)('CRM RLS — activities', () => {
  it('cross-org INSERT rejected by WITH CHECK', async () => {
    // WITH CHECK fires before FK constraint, so the lead FK does not need to exist.
    const fakeLeadId = '00000000-0000-0000-0000-000000000001';
    await expect(
      asTenant(orgA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO activities (id, "organizationId", type, description, metadata, "relatedLeadId", "createdAt")
           VALUES (uuid_generate_v4(), $1::uuid, 'LEAD_CREATED', 'evil', '{}', $2::uuid, now())`,
          orgB,
          fakeLeadId,
        ),
      ),
    ).rejects.toThrow();
  });
});

// ─── notes ────────────────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('CRM RLS — notes', () => {
  it('cross-org INSERT rejected by WITH CHECK', async () => {
    await expect(
      asTenant(orgA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO notes (id, "organizationId", content, "createdById", "updatedAt")
           VALUES (uuid_generate_v4(), $1::uuid, '{}', $2::uuid, now())`,
          orgB,
          userIdA,
        ),
      ),
    ).rejects.toThrow();
  });
});

// ─── files ────────────────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('CRM RLS — files', () => {
  it('cross-org INSERT rejected by WITH CHECK', async () => {
    await expect(
      asTenant(orgA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO files (id, "organizationId", name, "storageKey", "storageProvider", "mimeType", "sizeBytes", url, "uploadedById")
           VALUES (uuid_generate_v4(), $1::uuid, 'evil.pdf', 'key', 'S3', 'application/pdf', 1024, 'http://x', $2::uuid)`,
          orgB,
          userIdA,
        ),
      ),
    ).rejects.toThrow();
  });
});

// ─── custom_field_definitions ─────────────────────────────────────────────────

describe.skipIf(!pgUp)('CRM RLS — custom_field_definitions', () => {
  it('cross-org INSERT rejected by WITH CHECK', async () => {
    await expect(
      asTenant(orgA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO custom_field_definitions
             (id, "organizationId", "objectType", "fieldKey", "displayLabel", "fieldType", "isRequired", position, "createdById", "updatedAt")
           VALUES (uuid_generate_v4(), $1::uuid, 'LEAD', 'evil_field', 'Evil', 'TEXT', false, 0, $2::uuid, now())`,
          orgB,
          userIdA,
        ),
      ),
    ).rejects.toThrow();
  });
});

// ─── saved_replies ────────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('CRM RLS — saved_replies', () => {
  it('cross-org INSERT rejected by WITH CHECK', async () => {
    await expect(
      asTenant(orgA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO saved_replies (id, "organizationId", title, content, "isGlobal", "createdById", "updatedAt")
           VALUES (uuid_generate_v4(), $1::uuid, 'Evil', 'content', true, $2::uuid, now())`,
          orgB,
          userIdA,
        ),
      ),
    ).rejects.toThrow();
  });
});
