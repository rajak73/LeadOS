// Sprint 3 — TD-M2-2 — end-to-end tenantMiddleware integration (real JWT, assembled app).
//
// Closes the test-depth gap from SPRINT_3_M2_AUDIT: the production tenantMiddleware wiring
// (real JWT → authMiddleware → CachedMembershipValidator → prismaMembershipLookup via
// withTenant → TenantContext → route) is exercised end-to-end, not just unit-tested with fakes.
//
//   - member request     → 200 (through the real /api/v1/ping route)
//   - non-member request → 403
//   - TenantContext reaches the handler (probe app composing the REAL middleware)
//
// DB-gated; executes in CI (DEF-3 guard). Redis is optional — the validator falls through to
// the DB when the cache is unavailable.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { authMiddleware } from '../../src/core/middleware/auth.middleware.js';
import { tenantMiddleware } from '../../src/core/middleware/tenant.middleware.js';
import { getTenantContext, type TenantContext } from '../../src/core/tenancy/context.js';

const pgUp = await isPostgresUp();
const app = buildApp();

let orgId = ''; // org the user IS an active member of
let otherOrgId = ''; // org the user is NOT a member of
let userId = '';

function memberToken(): string {
  return signAccessToken({ sub: userId, orgId, role: 'OWNER', isSuperAdmin: false });
}
function nonMemberToken(): string {
  return signAccessToken({ sub: userId, orgId: otherOrgId, role: 'OWNER', isSuperAdmin: false });
}

// Probe app: the REAL authMiddleware + REAL tenantMiddleware in front of a handler that echoes
// the active TenantContext, proving context propagation through the production middleware.
function buildProbeApp(): express.Express {
  const probe = express();
  probe.get('/probe', authMiddleware, tenantMiddleware, (_req, res) => {
    res.json({ ctx: getTenantContext() ?? null });
  });
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    res.status((err as { statusCode?: number }).statusCode ?? 500).json({ ok: false });
  };
  probe.use(onError);
  return probe;
}

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();
  const [org] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `tm A ${nonce}`,
    `tm-a-${nonce}`,
  );
  const [other] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `tm B ${nonce}`,
    `tm-b-${nonce}`,
  );
  orgId = org!.id;
  otherOrgId = other!.id;
  const [user] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email, "passwordHash", "firstName", "lastName", "updatedAt")
       VALUES ($1, 'x', 'Mem', 'Ber', now()) RETURNING id`,
    `member+${nonce}@tm.test`,
  );
  userId = user!.id;
  const [role] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, 'OWNER', true, now()) RETURNING id`,
    orgId,
  );
  // ACTIVE membership only in orgId (none in otherOrgId).
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_members (id, "organizationId", "userId", "roleId", status, "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    orgId,
    userId,
    role!.id,
  );
});

afterAll(async () => {
  if (!pgUp || !orgId) return;
  await prisma.$executeRawUnsafe(
    `DELETE FROM organization_members WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
    orgId,
    otherOrgId,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM roles WHERE "organizationId" IN ($1::uuid, $2::uuid)`,
    orgId,
    otherOrgId,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, userId);
  await prisma.$executeRawUnsafe(
    `DELETE FROM organizations WHERE id IN ($1::uuid, $2::uuid)`,
    orgId,
    otherOrgId,
  );
});

describe.skipIf(!pgUp)('tenantMiddleware — end-to-end (TD-M2-2)', () => {
  it('member request → 200 through /api/v1/ping', async () => {
    const res = await request(app)
      .get('/api/v1/ping')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.pong).toBe(true);
  });

  it('non-member request → 403', async () => {
    const res = await request(app)
      .get('/api/v1/ping')
      .set('Authorization', `Bearer ${nonMemberToken()}`);
    expect(res.status).toBe(403);
  });

  it('TenantContext reaches the route handler with the token claims', async () => {
    const res = await request(buildProbeApp())
      .get('/probe')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(200);
    const ctx = res.body.ctx as TenantContext | null;
    expect(ctx).not.toBeNull();
    expect(ctx?.organizationId).toBe(orgId);
    expect(ctx?.userId).toBe(userId);
    expect(ctx?.role).toBe('OWNER');
  });

  it('non-member is rejected before reaching the handler (probe app)', async () => {
    const res = await request(buildProbeApp())
      .get('/probe')
      .set('Authorization', `Bearer ${nonMemberToken()}`);
    expect(res.status).toBe(403);
  });

  it('unauthenticated request is not membership-gated (no auth → passes tenant middleware)', async () => {
    // No token → authMiddleware sets no req.auth → tenantMiddleware passes through → handler
    // runs with NO tenant context (downstream guards, not tenantMiddleware, enforce auth).
    const res = await request(buildProbeApp()).get('/probe');
    expect(res.status).toBe(200);
    expect(res.body.ctx).toBeNull();
  });
});
