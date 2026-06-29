

import { PrismaClient } from '@prisma/client';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PrismaAuthRepository } from '../src/modules/auth/auth.repository.js';

const prisma = new PrismaClient();

// Dummy email sender for test
const dummyEmailSender = {
  sendVerificationEmail: async () => {},
  sendPasswordResetEmail: async () => {},
};

import bcrypt from 'bcryptjs';

async function testLogin(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    console.log(`Hash for ${email}: ${user.passwordHash}`);
    const ok = await bcrypt.compare('LeadOS@123', user.passwordHash);
    console.log(`Manual bcrypt.compare for ${email} with 'LeadOS@123': ${ok}`);
  }

  const authService = new AuthService(new PrismaAuthRepository(prisma), dummyEmailSender);
  try {
    const result = await authService.login({
      email,
      password: 'LeadOS@123',
    });
    console.log(`✅ Login SUCCESS for ${email}. Access Token length: ${result.accessToken.length}`);
    const jwtBase64 = result.accessToken.split('.')[1];
    if (jwtBase64) {
      console.log(`Payload: ${Buffer.from(jwtBase64, 'base64').toString('utf8')}`);
    }
  } catch (error: any) {
    console.error(`❌ Login FAILED for ${email}. Reason: ${error.message}`);
  }
}

async function main() {
  await testLogin('superadmin@leados.demo');
  await testLogin('owner@technova.demo');
  await testLogin('admin@technova.demo');
  await testLogin('sales1@technova.demo');
}

main().catch(console.error).finally(() => prisma.$disconnect());
