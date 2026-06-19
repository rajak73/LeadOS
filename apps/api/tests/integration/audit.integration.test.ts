// Sprint 3 M5 (AUD-1/AUD-2/AUD-3) — audit foundations over a real DB.
//
// Verifies: (a) RBAC role-admin actions write tenant-scoped audit_logs rows through the app;
// (b) the recorder masks PII in before/after end-to-end; (c) the audit row is org-scoped
// (organizationId injected by the tenant extension); (d) the platform_audit_logs scaffold
// writes. Runs over the admin connection (D2); DB-gated.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { PrismaAuditRecorder } from '../../src/core/audit/audit-recorder.js';
import { PrismaPlatformAuditWriter } from '../../src/core/audit/platform-audit.js';
import { runWithTenantContext, type TenantContext } from '../../src/core/tenancy/context.js';

const pgUp = await isPostgresUp();
const app = buildApp();

let orgId = '';
let ownerRoleId = '';
let salesRoleId = '';
let adminUserId = '';
let targetUserId = '';

const adminToken = (): string => signAccessToken({ sub: adminUserId, orgId, role: 'OWNER', isSuperAdmin: false });

async function seedUser(email: string): Promise<string> {
  const [u] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email, "passwordHash", "firstName", "lastName", "updatedAt")
       VALUES ($1, 'x', 'F', 'L', now()) RETURNING id`,
    email,
  );
  return u!.id;
}
async function seedRole(name: string): Promise<string> {
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
       VALUES (uuid_generate_v4(), $1::uuid, $2, true, now()) RETURNING id`,
    orgId,
    name,
  );
  return r!.id;
}

beforeAll(async () => {
  if (!pgUp) return;
  const nonce = process.hrtime.bigint().toString();
  const [org] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    `audit ${nonce}`,
    `audit-${nonce}`,
  );
  orgId = org!.id;
  ownerRoleId = await seedRole('OWNER');
  salesRoleId = await seedRole('SALES_EXECUTIVE');
  adminUserId = await seedUser(`admin+${nonce}@audit.test`);
  targetUserId = await seedUser(`target+${nonce}@audit.test`);
  for (const [uid, rid] of [
    [adminUserId, ownerRoleId],
    [targetUserId, salesRoleId],
  ]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO organization_members (id, "organizationId", "userId", "roleId", status, "updatedAt")
         VALUES (uuid_generate_v4(), $1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
      orgId,
      uid,
      rid,
    );
  }
});

afterAll(async () => {
  if (!pgUp || !orgId) return;
  await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM platform_audit_logs WHERE "targetOrganizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM organization_members WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM roles WHERE "organizationId" = $1::uuid`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`, adminUserId, targetUserId);
  await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
});

describe.skipIf(!pgUp)('AUD-2 — RBAC actions write audit_logs', () => {
  it('role change writes a member.role_changed audit row (org-scoped, with before/after)', async () => {
    const res = await request(app)
      .patch(`/api/v1/members/${targetUserId}/role`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ roleId: ownerRoleId });
    expect(res.status).toBe(200);

    const row = await prisma.auditLog.findFirst({
      where: { organizationId: orgId, action: 'member.role_changed', resourceId: targetUserId },
    });
    expect(row).not.toBeNull();
    expect(row?.organizationId).toBe(orgId); // injected by the tenant extension
    expect(row?.actorUserId).toBe(adminUserId);
    expect(row?.before).toEqual({ roleId: salesRoleId });
    expect(row?.after).toEqual({ roleId: ownerRoleId });
  });

  it('suspend writes a member.suspended audit row', async () => {
    const res = await request(app)
      .post(`/api/v1/members/${targetUserId}/suspend`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    const row = await prisma.auditLog.findFirst({
      where: { organizationId: orgId, action: 'member.suspended', resourceId: targetUserId },
    });
    expect(row?.after).toEqual({ status: 'SUSPENDED' });
  });
});

describe.skipIf(!pgUp)('AUD-2 — PII masking end-to-end', () => {
  it('masks email/phone in stored before/after snapshots', async () => {
    const ctx: TenantContext = {
      organizationId: orgId,
      userId: adminUserId,
      role: 'OWNER',
      isSuperAdmin: false,
      ipAddress: '203.0.113.9',
    };
    await runWithTenantContext(ctx, () =>
      new PrismaAuditRecorder().record({
        action: 'pii.probe',
        resource: 'user',
        resourceId: targetUserId,
        before: { email: 'secret@corp.com', phone: '555-111-2222', keep: 'yes' },
      }),
    );

    const row = await prisma.auditLog.findFirst({
      where: { organizationId: orgId, action: 'pii.probe' },
    });
    expect(row?.before).toEqual({ email: 's***@corp.com', phone: '***2222', keep: 'yes' });
    expect(row?.ipAddress).toBe('203.0.113.9');
  });
});

describe.skipIf(!pgUp)('AUD-3 — platform_audit_logs scaffold', () => {
  it('writes a platform audit row (masked detail)', async () => {
    await new PrismaPlatformAuditWriter().record({
      actorUserId: adminUserId,
      action: 'platform.org_inspected',
      targetOrganizationId: orgId,
      targetResource: 'organization',
      detail: { supportEmail: 'support@corp.com', note: 'investigation' },
    });
    const row = await prisma.platformAuditLog.findFirst({
      where: { targetOrganizationId: orgId, action: 'platform.org_inspected' },
    });
    expect(row).not.toBeNull();
    expect(row?.detail).toEqual({ supportEmail: 's***@corp.com', note: 'investigation' });
  });
});
