import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, passwordHash: true, status: true, emailVerifiedAt: true }
  });
  console.log(users);
}

main().catch(console.error).finally(() => prisma.$disconnect());
