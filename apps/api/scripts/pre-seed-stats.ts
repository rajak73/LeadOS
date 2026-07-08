import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.count();
  const orgs = await prisma.organization.count();
  const demoUsers = await prisma.user.count({ where: { email: { endsWith: '.demo' } } });
  const tnOrg = await prisma.organization.count({ where: { slug: 'technova' } });
  const gbOrg = await prisma.organization.count({ where: { slug: 'growthbridge' } });
  const ayOrg = await prisma.organization.count({ where: { slug: 'ayurda' } });
  
  console.log(`User Count: ${users}`);
  console.log(`Org Count: ${orgs}`);
  console.log(`.demo User Count: ${demoUsers}`);
  console.log(`TechNova: ${tnOrg}, GrowthBridge: ${gbOrg}, Ayurda: ${ayOrg}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
