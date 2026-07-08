import { prisma } from '../../src/core/prisma/client.js';

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  if (!org) { console.log('TechNova not found'); return; }

  // 1. Create Instagram Account
  await prisma.instagramAccount.upsert({
    where: { organizationId_igUserId: { organizationId: org.id, igUserId: 'ig_sys_acct_1' } },
    update: {},
    create: {
      organizationId: org.id,
      igUserId: 'ig_sys_acct_1',
      platform: 'INSTAGRAM',
      facebookPageId: 'fb_page_1',
      igUsername: 'technova_ig',
      accessToken: 'encrypted_dummy_token',
      tokenExpiresAt: new Date(Date.now() + 86400000 * 365),
      tokenType: 'bearer',
      status: 'ACTIVE',
      webhookSubscribed: true
    }
  });
  console.log('Created/Verified IG Account');

  // 2. Create existing lead for Instagram
  const owner = await prisma.user.findFirst({ where: { email: 'owner@technova.demo' } });
  if (owner) {
    await prisma.lead.upsert({
      where: { organizationId_instagramUserId: { organizationId: org.id, instagramUserId: 'ig_existing_user' } },
      update: {},
      create: {
        organizationId: org.id,
        firstName: 'IG',
        lastName: 'Existing',
        source: 'INSTAGRAM_DM',
        status: 'NEW',
        createdById: owner.id,
        instagramUserId: 'ig_existing_user',
        instagramHandle: 'ig_existing_user_handle'
      }
    });
    console.log('Created/Verified Existing IG Lead');
  }

  // 3. Create WhatsApp Account
  await prisma.whatsAppAccount.upsert({
    where: { organizationId_phoneNumberId: { organizationId: org.id, phoneNumberId: 'wa_phone_1' } },
    update: {},
    create: {
      organizationId: org.id,
      wabaId: 'waba_1',
      phoneNumberId: 'wa_phone_1',
      displayName: 'TechNova WA',
      phoneNumber: '1234567890',
      accessToken: 'encrypted_dummy_token',
      status: 'ACTIVE',
      webhookVerified: true
    }
  });
  console.log('Created/Verified WA Account');

}
main().finally(() => process.exit(0));
