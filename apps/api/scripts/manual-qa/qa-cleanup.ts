import { prisma } from '../../src/core/prisma/client.js';

async function main() {
  console.log('--- Phase 2 QA Data Cleanup Execution ---');
  
  const targetIgUserIds = ['ig_sys_acct_1', 'fb_sys_acct_1'];
  const targetFbPageIds = ['fb_page_2', 'fb_page_1']; // from qa-setup-fb.ts and qa-setup.ts
  const targetWaPhoneIds = ['wa_phone_1'];
  const targetLeadNames = ['IG User', 'WA User', 'Facebook User', 'WA'];
  const targetExternalEventPrefixes = ['ig_', 'fb_', 'fb2_', 'fb3_', 'wa_'];
  
  const technovaOrg = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  if (!technovaOrg) throw new Error('TechNova org not found');

  // FIND TARGETS
  const igAccounts = await prisma.instagramAccount.findMany({
    where: { 
      organizationId: technovaOrg.id,
      OR: [
        { igUserId: { in: targetIgUserIds } },
        { facebookPageId: { in: targetFbPageIds } }
      ]
    },
    select: { id: true, igUserId: true, platform: true }
  });

  const waAccounts = await prisma.whatsAppAccount.findMany({
    where: {
      organizationId: technovaOrg.id,
      phoneNumberId: { in: targetWaPhoneIds }
    },
    select: { id: true, phoneNumberId: true }
  });

  const leads = await prisma.lead.findMany({
    where: {
      organizationId: technovaOrg.id,
      firstName: { in: targetLeadNames },
      source: { in: ['INSTAGRAM_DM', 'WHATSAPP', 'FACEBOOK_DM'] }
    },
    select: { id: true, firstName: true, source: true }
  });
  
  const existingIgLead = await prisma.lead.findFirst({
    where: {
      organizationId: technovaOrg.id,
      instagramUserId: 'ig_existing_user'
    }
  });
  if (existingIgLead && !leads.find(l => l.id === existingIgLead.id)) leads.push(existingIgLead as any);

  const webhookEvents = await prisma.webhookEvent.findMany({
    where: {
      OR: targetExternalEventPrefixes.map(prefix => ({
        externalEventId: { startsWith: prefix }
      }))
    },
    select: { id: true, externalEventId: true }
  });

  console.log(`Deleting ${webhookEvents.length} Webhook Events...`);
  if (webhookEvents.length > 0) {
    await prisma.webhookEvent.deleteMany({ where: { id: { in: webhookEvents.map(w => w.id) } } });
  }

  // Find linked conversations to accounts so we can delete messages first
  const igConvs = await prisma.instagramConversation.findMany({
    where: { igAccountId: { in: igAccounts.map(a => a.id) } }
  });
  const waConvs = await prisma.whatsAppConversation.findMany({
    where: { accountId: { in: waAccounts.map(a => a.id) } }
  });

  const convIds = [...igConvs.map(c => c.id), ...waConvs.map(c => c.id)];
  
  console.log(`Deleting Messages for ${convIds.length} conversations...`);
  if (convIds.length > 0) {
    await prisma.message.deleteMany({ where: { conversationId: { in: convIds } } });
  }

  console.log(`Deleting ${igConvs.length} IG Conversations and ${waConvs.length} WA Conversations...`);
  if (igConvs.length > 0) await prisma.instagramConversation.deleteMany({ where: { id: { in: igConvs.map(c => c.id) } } });
  if (waConvs.length > 0) await prisma.whatsAppConversation.deleteMany({ where: { id: { in: waConvs.map(c => c.id) } } });

  console.log(`Deleting ${leads.length} Leads...`);
  if (leads.length > 0) {
    await prisma.lead.deleteMany({ where: { id: { in: leads.map(l => l.id) } } });
  }

  console.log(`Deleting ${igAccounts.length} IG Accounts and ${waAccounts.length} WA Accounts...`);
  if (igAccounts.length > 0) await prisma.instagramAccount.deleteMany({ where: { id: { in: igAccounts.map(a => a.id) } } });
  if (waAccounts.length > 0) await prisma.whatsAppAccount.deleteMany({ where: { id: { in: waAccounts.map(a => a.id) } } });

  console.log('Cleanup completed successfully.');
}

main().catch(console.error).finally(() => process.exit(0));
