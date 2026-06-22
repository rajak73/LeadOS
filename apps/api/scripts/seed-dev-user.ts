// One-time dev-environment seed: creates a loginnable admin user with a known password.
// Safe to run multiple times (upserts on email + org slug).
//
// Usage:  cd apps/api && npx tsx scripts/seed-dev-user.ts
// Or via package.json script: pnpm --filter @leados/api seed:dev
//
// Credentials written to stdout after seeding.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { ROLE_PERMISSIONS, type SystemRole } from '@leados/shared';
import { hashPassword } from '../src/core/crypto/password.js';

// Load workspace-root .env (same pattern as check-rls-coverage.ts and tests/global-setup.ts).
(function loadEnvFile() {
  if (process.env['DATABASE_URL']) return;
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const raw = readFileSync(resolve(root, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && val && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* .env absent — caller must supply DATABASE_URL */ }
})();

const DEV_EMAIL = 'admin@leados.local';
const DEV_PASSWORD = 'Admin1234!';
const DEV_ORG_NAME = 'LeadOS Dev';
const DEV_ORG_SLUG = 'leados-dev';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('[seed:dev] Starting dev-user seed…');

  const passwordHash = await hashPassword(DEV_PASSWORD);

  await prisma.$transaction(async (tx) => {
    // Upsert org — safe to re-run.
    const org = await tx.organization.upsert({
      where: { slug: DEV_ORG_SLUG },
      create: { name: DEV_ORG_NAME, slug: DEV_ORG_SLUG },
      update: { name: DEV_ORG_NAME },
      select: { id: true },
    });

    // Upsert user — re-running updates the password hash and verifies the email.
    const user = await tx.user.upsert({
      where: { email: DEV_EMAIL },
      create: {
        email: DEV_EMAIL,
        passwordHash,
        firstName: 'Dev',
        lastName: 'Admin',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
      update: {
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
      select: { id: true },
    });

    // Seed all four system roles for this org (idempotent via upsert).
    const roleIds: Record<string, string> = {};
    for (const roleName of Object.keys(ROLE_PERMISSIONS) as SystemRole[]) {
      const role = await tx.role.upsert({
        where: { organizationId_name: { organizationId: org.id, name: roleName } },
        create: { organizationId: org.id, name: roleName, isSystem: true },
        update: {},
        select: { id: true },
      });
      roleIds[roleName] = role.id;

      // Upsert permissions for this role.
      for (const key of ROLE_PERMISSIONS[roleName]) {
        const [resource, ...rest] = key.split('.');
        await tx.permission.upsert({
          where: { roleId_resource_action: { roleId: role.id, resource: resource ?? key, action: rest.join('.') } },
          create: { roleId: role.id, resource: resource ?? key, action: rest.join('.') },
          update: {},
        });
      }
    }

    // Assign user as OWNER of the org.
    const ownerRoleId = roleIds['OWNER'];
    if (!ownerRoleId) throw new Error('OWNER role not found after seeding');

    await tx.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      create: {
        organizationId: org.id,
        userId: user.id,
        roleId: ownerRoleId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
      update: {
        roleId: ownerRoleId,
        status: 'ACTIVE',
      },
    });

    // Subscription (TRIAL) — required for org to be fully functional.
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await tx.subscription.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        plan: 'TRIAL',
        status: 'TRIALING',
        trialEndsAt,
      },
      update: {},
    });

    console.log('[seed:dev] ✓ Organization:', org.id);
    console.log('[seed:dev] ✓ User:', user.id);
  });

  console.log('');
  console.log('[seed:dev] Dev user ready:');
  console.log('  Email   :', DEV_EMAIL);
  console.log('  Password:', DEV_PASSWORD);
  console.log('  URL     : http://localhost:3000/login');
  console.log('');
}

main()
  .catch((err) => {
    console.error('[seed:dev] Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
