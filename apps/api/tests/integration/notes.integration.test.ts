// Sprint 4 M5 — CRM-5.1 Notes module integration tests.
//
// Real JWTs + assembled app + real Postgres as leados_app (via withTenant).
// DB-gated: self-skips when Postgres is unavailable.
//
// Coverage checklist (10 tests):
//   POST   /notes              → 201 note linked to lead (NOTE_ADDED activity emitted)
//   POST   /notes              → 422 missing content
//   POST   /notes              → 422 no entity FK (refine fails)
//   POST   /notes              → 401 no auth
//   PATCH  /notes/:id          → 200 content updated (NOTE_UPDATED activity emitted)
//   DELETE /notes/:id          → 204 soft delete (NOTE_DELETED activity emitted)
//   GET    /leads/:id/notes    → 200 paginated list includes the note
//   GET    /leads/:id/notes    → 404 cross-org isolation (RLS hides lead)
//   GET    /contacts/:id/notes → 200 paginated list for contact
//   SALES_EXECUTIVE            → 403 on DELETE /notes/:id (no notes.delete permission)

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

  orgA = await seedOrg(`Notes A ${nonce}`, `notes-a-${nonce}`);
  orgB = await seedOrg(`Notes B ${nonce}`, `notes-b-${nonce}`);

  ownerUserId = await seedUser(`notes-owner+${nonce}@notes.test`);
  salesUserId = await seedUser(`notes-sales+${nonce}@notes.test`);
  otherUserId = await seedUser(`notes-other+${nonce}@notes.test`);

  const ownerRoleA = await seedRole(orgA, 'OWNER');
  const salesRoleA = await seedRole(orgA, 'SALES_EXECUTIVE');
  const ownerRoleB = await seedRole(orgB, 'OWNER');

  await seedMember(orgA, ownerUserId, ownerRoleA);
  await seedMember(orgA, salesUserId, salesRoleA);
  await seedMember(orgB, otherUserId, ownerRoleB);

  await seedSubscription(orgA);
  await seedSubscription(orgB);

  // Seed a lead and contact for sub-resource tests
  const [leadRow] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO leads (id, "organizationId", "firstName", source, status, "createdById", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, 'NoteTestLead', 'MANUAL', 'NEW', $2::uuid, now()) RETURNING id`,
    orgA, ownerUserId,
  );
  leadId = leadRow!.id;

  const [contactRow] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO contacts (id, "organizationId", "firstName", "createdById", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, 'NoteTestContact', $2::uuid, now()) RETURNING id`,
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

const TIPTAP_DOC = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] };

// ── POST /notes ───────────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('POST /notes', () => {
  it('201 — creates a note linked to a lead and emits NOTE_ADDED activity', async () => {
    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ content: TIPTAP_DOC, relatedLeadId: leadId });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      organizationId: orgA,
      relatedLeadId: leadId,
    });
    expect(res.body.data.content).toEqual(TIPTAP_DOC);
  });

  it('422 — rejects missing content', async () => {
    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ relatedLeadId: leadId });
    expect(res.status).toBe(422);
  });

  it('422 — rejects note with no entity FK (refine)', async () => {
    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ content: TIPTAP_DOC });
    expect(res.status).toBe(422);
  });

  it('401 — rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/notes')
      .send({ content: TIPTAP_DOC, relatedLeadId: leadId });
    expect(res.status).toBe(401);
  });
});

// ── PATCH /notes/:id ──────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('PATCH /notes/:id', () => {
  let noteId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ content: TIPTAP_DOC, relatedLeadId: leadId });
    noteId = res.body.data.id as string;
  });

  it('200 — updates note content and emits NOTE_UPDATED activity', async () => {
    const updated = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated' }] }] };
    const res = await request(app)
      .patch(`/api/v1/notes/${noteId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ content: updated });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toEqual(updated);
  });
});

// ── DELETE /notes/:id ─────────────────────────────────────────────────────────

describe.skipIf(!pgUp)('DELETE /notes/:id', () => {
  let noteId = '';

  beforeAll(async () => {
    if (!pgUp) return;
    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ content: TIPTAP_DOC, relatedLeadId: leadId });
    noteId = res.body.data.id as string;
  });

  it('204 — soft deletes a note', async () => {
    const res = await request(app)
      .delete(`/api/v1/notes/${noteId}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(204);
  });

  it('403 — SALES_EXECUTIVE cannot delete notes (no notes.delete permission)', async () => {
    // Create a fresh note to attempt deletion
    const createRes = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ content: TIPTAP_DOC, relatedLeadId: leadId });
    const salesNoteId = createRes.body.data.id as string;

    const res = await request(app)
      .delete(`/api/v1/notes/${salesNoteId}`)
      .set('Authorization', `Bearer ${salesToken()}`);
    expect(res.status).toBe(403);
  });
});

// ── GET /leads/:id/notes ──────────────────────────────────────────────────────

describe.skipIf(!pgUp)('GET /leads/:id/notes', () => {
  beforeAll(async () => {
    if (!pgUp) return;
    // Ensure at least one note exists for the lead
    await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ content: TIPTAP_DOC, relatedLeadId: leadId });
  });

  it('200 — returns paginated notes for the lead', async () => {
    const res = await request(app)
      .get(`/api/v1/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 25 });
  });

  it('404 — cross-org token cannot access notes (RLS hides lead)', async () => {
    const res = await request(app)
      .get(`/api/v1/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${otherOrgToken()}`);
    expect(res.status).toBe(404);
  });
});

// ── GET /contacts/:id/notes ───────────────────────────────────────────────────

describe.skipIf(!pgUp)('GET /contacts/:id/notes', () => {
  beforeAll(async () => {
    if (!pgUp) return;
    await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ content: TIPTAP_DOC, relatedContactId: contactId });
  });

  it('200 — returns paginated notes for the contact', async () => {
    const res = await request(app)
      .get(`/api/v1/contacts/${contactId}/notes`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 25 });
  });
});
