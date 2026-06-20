// Sprint 4 M5 — CRM-5.2 Files module integration tests.
//
// Real JWTs + assembled app + real Postgres as leados_app (via withTenant).
// DB-gated: self-skips when Postgres is unavailable.
//
// Coverage checklist (10 tests):
//   POST   /files/presigned-url → 200 returns mock presigned URL + storageKey + fileId
//   POST   /files/presigned-url → 422 disallowed MIME type
//   POST   /files/presigned-url → 401 no auth
//   POST   /files               → 201 records file metadata (sizeBytes as number, not bigint)
//   POST   /files               → 422 invalid fileId UUID
//   DELETE /files/:id           → 204 soft delete
//   GET    /leads/:id/files     → 200 paginated list includes the file record
//   GET    /leads/:id/files     → 404 cross-org isolation (RLS hides lead)
//   GET    /contacts/:id/files  → 200 paginated list for contact
//   SALES_EXECUTIVE             → 403 on DELETE /files/:id (no files.delete permission)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';

const pgUp = await isPostgresUp();
const app = buildApp();

let orgA = '';
let orgB = '';
let ownerUserId = '';
let salesUserId = '';
let otherUserId = '';
let leadId = '';
let contactId = '';

function ownerToken(): string {
  return signAccessToken({ sub: ownerUserId, orgId: orgA, role: 'OWNER', isSuperAdmin: false });
}
function salesToken(): string {
  return signAccessToken({ sub: salesUserId, orgId: orgA, role: 'SALES_EXECUTIVE', isSuperAdmin: false });
}
function otherOrgToken(): string {
  return signAccessToken({ sub: otherUserId, orgId: orgB, role: 'OWNER', isSuperAdmin: false });
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
     VALUES ($1, 'x', 'Test', 'User', now()) RETURNING id`,
    email,
  );
  return row!.id;
}

async function seedRole(orgId: string, name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, $2, true, now()) RETURNING id`,
    orgId, name,
  );
  return row!.id;
}

async function seedMember(orgId: string, userId: string, roleId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_members (id, "organizationId", "userId", "roleId", status, "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    orgId, userId, roleId,
  );
}

async function seedSubscription(orgId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO subscriptions ("organizationId", plan, status, "updatedAt")
     VALUES ($1::uuid, 'TRIAL'::"SubscriptionPlan", 'ACTIVE', now())
     ON CONFLICT ("organizationId") DO UPDATE SET plan = EXCLUDED.plan`,
    orgId,
  );
}

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();

  orgA = await seedOrg(`Files A ${nonce}`, `files-a-${nonce}`);
  orgB = await seedOrg(`Files B ${nonce}`, `files-b-${nonce}`);

  ownerUserId = await seedUser(`files-owner+${nonce}@files.test`);
  salesUserId = await seedUser(`files-sales+${nonce}@files.test`);
  otherUserId = await seedUser(`files-other+${nonce}@files.test`);

  const ownerRoleA = await seedRole(orgA, 'OWNER');
  const salesRoleA = await seedRole(orgA, 'SALES_EXECUTIVE');
  const ownerRoleB = await seedRole(orgB, 'OWNER');

  await seedMember(orgA, ownerUserId, ownerRoleA);
  await seedMember(orgA, salesUserId, salesRoleA);
  await seedMember(orgB, otherUserId, ownerRoleB);

  await seedSubscription(orgA);
  await seedSubscription(orgB);

  const [leadRow] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, 'FileTestLead', 'MANUAL', 'NEW', $2::uuid, now()) RETURNING id`,
    orgA, ownerUserId,
  );
  leadId = leadRow!.id;

  const [contactRow] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO contacts (id, "organizationId", "firstName", "createdById", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, 'FileTestContact', $2::uuid, now()) RETURNING id`,
    orgA, ownerUserId,
  );
  contactId = contactRow!.id;
});

afterAll(async () => {
  if (!pgUp || !orgA) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    await tx.$executeRawUnsafe(
      `DELETE FROM organization_members WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
      orgA, orgB,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM roles WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
      orgA, orgB,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid)`,
      orgA, orgB,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`,
      ownerUserId, salesUserId, otherUserId,
    );
  });
});

// ── POST /files/presigned-url ─────────────────────────────────────────────────

describe.skipIf(!pgUp)('POST /files/presigned-url', () => {
  it('200 — returns mock presigned URL in test mode', async () => {
    const res = await request(app)
      .post('/api/v1/files/presigned-url')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024 * 100,
        relatedLeadId: leadId,
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      storageProvider: 'S3',
      storageKey: expect.stringContaining('contract.pdf') as string,
    });
    expect(typeof res.body.data.presignedUrl).toBe('string');
    expect(typeof res.body.data.fileId).toBe('string');
    // In test mode the URL uses the mock host
    expect(res.body.data.presignedUrl as string).toContain('mock-storage.test');
  });

  it('422 — rejects disallowed MIME type', async () => {
    const res = await request(app)
      .post('/api/v1/files/presigned-url')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ fileName: 'script.sh', mimeType: 'application/x-sh', sizeBytes: 512 });
    expect(res.status).toBe(422);
  });

  it('401 — rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/files/presigned-url')
      .send({ fileName: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 512 });
    expect(res.status).toBe(401);
  });
});

// ── POST /files (record metadata) ────────────────────────────────────────────

describe.skipIf(!pgUp)('POST /files', () => {
  it('201 — records file metadata; sizeBytes is number (not BigInt) in response', async () => {
    // Step 1: get a presigned URL to obtain a pre-assigned fileId
    const presignedRes = await request(app)
      .post('/api/v1/files/presigned-url')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ fileName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 2048, relatedLeadId: leadId });

    const { fileId, storageKey } = presignedRes.body.data as { fileId: string; storageKey: string };

    // Step 2: record metadata after "upload"
    const res = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        fileId,
        fileName: 'report.pdf',
        storageKey,
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        url: 'https://s3.example.com/report.pdf',
        relatedLeadId: leadId,
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: fileId,
      name: 'report.pdf',
      mimeType: 'application/pdf',
      organizationId: orgA,
      relatedLeadId: leadId,
    });
    // sizeBytes must be a number (not string or object — BigInt serialization check)
    expect(typeof res.body.data.sizeBytes).toBe('number');
    expect(res.body.data.sizeBytes).toBe(2048);
  });

  it('422 — rejects invalid fileId UUID', async () => {
    const res = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        fileId: 'not-a-uuid',
        fileName: 'doc.pdf',
        storageKey: 'key',
        mimeType: 'application/pdf',
        sizeBytes: 512,
        url: 'https://s3.example.com/doc.pdf',
      });
    expect(res.status).toBe(422);
  });
});

// ── DELETE /files/:id ─────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('DELETE /files/:id', () => {
  let fileId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    const presignedRes = await request(app)
      .post('/api/v1/files/presigned-url')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ fileName: 'delete-me.pdf', mimeType: 'application/pdf', sizeBytes: 512 });
    const { fileId: fid, storageKey } = presignedRes.body.data as { fileId: string; storageKey: string };

    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        fileId: fid,
        fileName: 'delete-me.pdf',
        storageKey,
        mimeType: 'application/pdf',
        sizeBytes: 512,
        url: 'https://s3.example.com/delete-me.pdf',
        relatedLeadId: leadId,
      });
    fileId = fid;
  });

  it('204 — soft deletes a file (physical deletion deferred to S3 lifecycle)', async () => {
    const res = await request(app)
      .delete(`/api/v1/files/${fileId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(204);
  });

  it('403 — SALES_EXECUTIVE cannot delete files (no files.delete permission)', async () => {
    // Create a fresh file for this test
    const presignedRes = await request(app)
      .post('/api/v1/files/presigned-url')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ fileName: 'sales-test.pdf', mimeType: 'application/pdf', sizeBytes: 256 });
    const { fileId: fid, storageKey } = presignedRes.body.data as { fileId: string; storageKey: string };
    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        fileId: fid, fileName: 'sales-test.pdf', storageKey,
        mimeType: 'application/pdf', sizeBytes: 256,
        url: 'https://s3.example.com/sales-test.pdf', relatedLeadId: leadId,
      });

    const res = await request(app)
      .delete(`/api/v1/files/${fid}`)
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(403);
  });
});

// ── GET /leads/:id/files ──────────────────────────────────────────────────────

describe.skipIf(!pgUp)('GET /leads/:id/files', () => {
  beforeAll(async () => {
    if (!pgUp) return;
    const presignedRes = await request(app)
      .post('/api/v1/files/presigned-url')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ fileName: 'lead-file.pdf', mimeType: 'application/pdf', sizeBytes: 1024, relatedLeadId: leadId });
    const { fileId, storageKey } = presignedRes.body.data as { fileId: string; storageKey: string };
    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        fileId, fileName: 'lead-file.pdf', storageKey,
        mimeType: 'application/pdf', sizeBytes: 1024,
        url: 'https://s3.example.com/lead-file.pdf', relatedLeadId: leadId,
      });
  });

  it('200 — returns paginated files for the lead', async () => {
    const res = await request(app)
      .get(`/api/v1/leads/${leadId}/files`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 25 });
    // Confirm sizeBytes is numeric in list responses too
    expect(typeof (res.body.data[0] as { sizeBytes: unknown }).sizeBytes).toBe('number');
  });

  it('404 — cross-org token cannot access files (RLS hides lead)', async () => {
    const res = await request(app)
      .get(`/api/v1/leads/${leadId}/files`)
      .set('Authorization', `Bearer ${otherOrgToken()}`);
    expect(res.status).toBe(404);
  });
});

// ── GET /contacts/:id/files ───────────────────────────────────────────────────

describe.skipIf(!pgUp)('GET /contacts/:id/files', () => {
  beforeAll(async () => {
    if (!pgUp) return;
    const presignedRes = await request(app)
      .post('/api/v1/files/presigned-url')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ fileName: 'contact-file.pdf', mimeType: 'application/pdf', sizeBytes: 512, relatedContactId: contactId });
    const { fileId, storageKey } = presignedRes.body.data as { fileId: string; storageKey: string };
    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        fileId, fileName: 'contact-file.pdf', storageKey,
        mimeType: 'application/pdf', sizeBytes: 512,
        url: 'https://s3.example.com/contact-file.pdf', relatedContactId: contactId,
      });
  });

  it('200 — returns paginated files for the contact', async () => {
    const res = await request(app)
      .get(`/api/v1/contacts/${contactId}/files`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 25 });
  });
});
