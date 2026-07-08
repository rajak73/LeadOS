import { PrismaClient } from '@prisma/client';
import { OrganizationRepository } from '../../apps/api/src/modules/organizations/organization.repository.js';
const prisma = new PrismaClient();

async function main() {
  console.log('[seed] Seeding initial Super Admin and Organization...');

  // 1. Create Super Admin User
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@leados.app' },
    update: { isSuperAdmin: true },
    create: {
      email: 'superadmin@leados.app',
      firstName: 'Super',
      lastName: 'Admin',
      status: 'ACTIVE',
      isSuperAdmin: true,
      lastLoginAt: new Date(),
    },
  });
  console.log(`[seed] Upserted Super Admin: ${superAdmin.email}`);

  // 2. Create Default Organization with Roles
  const repo = new OrganizationRepository();
  const existingOrg = await prisma.organization.findFirst({ where: { slug: 'acme-corp' } });
  
  if (!existingOrg) {
    const org = await repo.createOrganizationWithDefaults('Acme Corp', superAdmin.id, {
      industry: 'Software',
      timezone: 'UTC',
    });
    console.log(`[seed] Created Organization: ${org.name}`);
  } else {
    console.log(`[seed] Organization Acme Corp already exists`);
  }

  console.log('[seed] Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
