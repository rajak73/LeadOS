import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: {
      email: { endsWith: '.demo' },
      emailVerifiedAt: null
    },
    data: {
      emailVerifiedAt: new Date()
    }
  });

  console.log(`Patched ${result.count} demo users to be verified.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
