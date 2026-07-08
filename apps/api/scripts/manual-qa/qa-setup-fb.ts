import { prisma } from '../../src/core/prisma/client.js';

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  if (!org) { console.log('TechNova not found'); return; }

  // 1. Create Facebook Account
  await prisma.instagramAccount.upsert({
    where: { organizationId_igUserId: { organizationId: org.id, igUserId: 'fb_sys_acct_1' } },
    update: {},
    create: {
      organizationId: org.id,
      igUserId: 'fb_sys_acct_1',
      platform: 'FACEBOOK',
      facebookPageId: 'fb_page_2', // distinct page id
      igUsername: 'technova_fb',
      accessToken: 'encrypted_dummy_token',
      tokenExpiresAt: new Date(Date.now() + 86400000 * 365),
      tokenType: 'bearer',
      status: 'ACTIVE',
      webhookSubscribed: true
    }
  });
  console.log('Created/Verified FB Account');
}
main().finally(() => process.exit(0));
