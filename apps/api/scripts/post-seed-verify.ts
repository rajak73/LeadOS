import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const emails = [
    'superadmin@leados.demo',
    'owner@technova.demo',
    'admin@technova.demo',
    'manager@technova.demo',
    'sales1@technova.demo',
    'support@technova.demo',
    'owner@growthbridge.demo',
    'owner@ayurda.demo'
  ];
  
  for (const email of emails) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { organization: true, role: true }
        }
      }
    });
    
    if (!user) {
      console.log(`[FAIL] ${email} - Not found`);
      continue;
    }
    
    const hasHash = !!user.passwordHash;
    const isVerified = !!user.emailVerifiedAt;
    const active = user.status === 'ACTIVE';
    const orgs = user.memberships.map(m => `${m.organization.name} (${m.role.name}, OrgStatus: ${m.organization.deletedAt ? 'Deleted' : 'Active'})`).join(' | ');
    
    console.log(`[PASS] ${email} | Active: ${active} | Hash: ${hasHash} | Verified: ${isVerified} | Orgs: ${orgs || 'None'}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
