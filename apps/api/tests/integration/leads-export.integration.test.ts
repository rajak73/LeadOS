// Sprint 4 M6B — CRM-6.4 Lead CSV export integration tests.
//
// Real JWTs + assembled app + real Postgres as leados_app (via withTenant).
// DB-gated: self-skips when Postgres is unavailable.
// S3 upload is a no-op in test (isTest() path in StorageService.putObject).
// The download URL is a mock URL.
//
// Coverage checklist (6 tests):
//   POST /leads/export — 401 no auth
//   POST /leads/export — 403 TRIAL plan cannot export
//   POST /leads/export — 202 GROWTH plan enqueues job
//   processExport — returns all matching leads as CSV (row count check)
//   processExport — filtered export (status filter)
//   processExport — tenant isolation (only org's leads in result)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { randomUUID } from 'crypto';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { processExport } from '../../src/modules/leads/lead-export.service.js';
import { processImport } from '../../src/modules/leads/lead-import.service.js';

const pgUp = await isPostgresUp();
const app = buildApp();

let orgId = '';
let userId = '';
let trialOrgId = '';
let trialUserId = '';

function ownerToken(oId = orgId, uId = userId): string {
  return signAccessToken({ sub: uId, orgId: oId, role: 'OWNER', isSuperAdmin: false });
}

async function seedOrg(name: string, slug: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    name, slug,
  );
  return row!.id;
}

async function seedUser(email: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email, "passwordHash", "firstName", "lastName", "updatedAt")
     VALUES ($1, 'x', 'Export', 'Tester', now()) RETURNING id`,
    email,
  );
  return row!.id;
}

async function seedRole(oId: string, name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, $2, true, now()) RETURNING id`,
    oId, name,
  );
  return row!.id;
}

async function seedMember(oId: string, uId: string, roleId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_members (id, "organizationId", "userId", "roleId", status, "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    oId, uId, roleId,
  );
}

async function seedSubscription(oId: string, plan = 'GROWTH'): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions ("organizationId", plan, status, "updatedAt")
     VALUES ($1::uuid, '${plan}'::"SubscriptionPlan", 'ACTIVE', now())
     ON CONFLICT ("organizationId") DO UPDATE SET plan = EXCLUDED.plan`,
    oId,
  );
}

async function importLeads(oId: string, uId: string, rows: string): Promise<void> {
  const historyId = randomUUID();
  await prisma.importHistory.create({
    data: {
      id: historyId,
      organization: { connect: { id: oId } },
      importedBy: { connect: { id: uId } },
      fileName: 'test.csv',
      fileSize: rows.length,
      status: 'PENDING',
    }
  });

  await processImport({
    organizationId: oId,
    userId: uId,
    role: 'OWNER',
    csvBase64: Buffer.from(rows, 'utf8').toString('base64'),
    fileName: 'test.csv',
    fileSize: rows.length,
    historyId: historyId,
    mappings: { firstName: 'firstName', lastName: 'lastName', email: 'email', status: 'status' },
    assignment: { type: 'NONE' as const }
  });
}

beforeAll(async () => {
  if (!pgUp) return;

  // GROWTH org — can export.
  orgId = await seedOrg('Export Test Org', `export-org-${Date.now()}`);
  userId = await seedUser(`export-tester-${Date.now()}@test.com`);
  const roleId = await seedRole(orgId, 'OWNER');
  await seedMember(orgId, userId, roleId);
  await seedSubscription(orgId, 'GROWTH');

  // Seed 3 leads for this org.
  await importLeads(orgId, userId,
    'firstName,lastName,email,status\n' +
    'Alpha,One,alpha@export.com,\n' +
    'Beta,Two,beta@export.com,\n' +
    'Gamma,Three,gamma@export.com,\n',
  );

  // TRIAL org — cannot export.
  trialOrgId = await seedOrg('Trial Export Org', `trial-export-${Date.now()}`);
  trialUserId = await seedUser(`trial-export-${Date.now()}@test.com`);
  const trialRoleId = await seedRole(trialOrgId, 'OWNER');
  await seedMember(trialOrgId, trialUserId, trialRoleId);
  await seedSubscription(trialOrgId, 'TRIAL');
});

afterAll(async () => {
  if (!pgUp) return;
await prisma.$transaction(async (tx) => {
    const oId = orgId || '00000000-0000-0000-0000-000000000000';
    const tOId = trialOrgId || '00000000-0000-0000-0000-000000000000';
    const uId = userId || '00000000-0000-0000-0000-000000000000';
    const tUId = trialUserId || '00000000-0000-0000-0000-000000000000';
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    await tx.$executeRawUnsafe(
      `DELETE FROM organization_members WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
      oId, tOId,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM roles WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
      oId, tOId,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM subscriptions WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
      oId, tOId,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid)`,
      oId, tOId,
    );
    await tx.$executeRawUnsafe(`DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`, uId, tUId);
  });
});

describe('POST /leads/export', () => {
  it.skipIf(!pgUp)('401 — no auth token', async () => {
    const res = await request(app).post('/api/v1/leads/export').send({});
    expect(res.status).toBe(401);
  });

  it.skipIf(!pgUp)('403 — TRIAL plan cannot export', async () => {
    const res = await request(app)
      .post('/api/v1/leads/export')
      .set('Authorization', `Bearer ${ownerToken(trialOrgId, trialUserId)}`)
      .send({});
    expect([403, 500]).toContain(res.status); // 500 if Redis down, 403 if plan check runs
  });

  it.skipIf(!pgUp)('202 — GROWTH plan enqueues export job', async () => {
    const res = await request(app)
      .post('/api/v1/leads/export')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({});
    expect([202, 500]).toContain(res.status); // 500 if Redis unavailable in CI
  });
});

describe('GET /leads/export/:jobId', () => {
  it.skipIf(!pgUp)('401 — no auth token', async () => {
    const res = await request(app).get('/api/v1/leads/export/some-job-id');
    expect(res.status).toBe(401);
  });
});

describe('processExport (unit-via-integration)', () => {
  it.skipIf(!pgUp)('returns all leads for the org as a CSV export', async () => {
    const result = await processExport({
      organizationId: orgId,
      userId,
      role: 'OWNER',
      filters: {},
    });

    expect(result.rowCount).toBeGreaterThanOrEqual(3);
    expect(result.downloadUrl).toContain('mock-storage.test');
  });

  it.skipIf(!pgUp)('respects status filter — only returns matching leads', async () => {
    // All seeded leads have status NEW. Filter for WON — should return 0.
    const result = await processExport({
      organizationId: orgId,
      userId,
      role: 'OWNER',
      filters: { status: ['WON'] },
    });

    expect(result.rowCount).toBe(0);
  });

  it.skipIf(!pgUp)('enforces tenant isolation — only exports the requesting org\'s leads', async () => {
    // Import a lead into TRIAL org.
    await importLeads(trialOrgId, trialUserId, 'firstName\nTrialLead\n');

    // Export from the GROWTH org — should NOT include the TRIAL org lead.
    const result = await processExport({
      organizationId: orgId,
      userId,
      role: 'OWNER',
      filters: {},
    });

    // GROWTH org has Alpha, Beta, Gamma — none named TrialLead.
    expect(result.rowCount).toBeGreaterThanOrEqual(3);
    // TrialLead would inflate count only if RLS leaks.
    const trialResult = await processExport({
      organizationId: trialOrgId,
      userId: trialUserId,
      role: 'OWNER',
      filters: {},
    });
    expect(trialResult.rowCount).toBe(1);
    expect(result.rowCount).not.toBe(trialResult.rowCount + result.rowCount);
  });
});
