import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ select: { email: true, status: true, passwordHash: true } });
  console.log("Users in DB:");
  console.log(users.map(u => `${u.email} (Status: ${u.status}, HasHash: ${!!u.passwordHash})`).join('\n'));
}
main().catch(console.error).finally(() => prisma.$disconnect());
