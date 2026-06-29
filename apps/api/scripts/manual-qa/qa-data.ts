import { prisma } from '../../src/core/prisma/client.js';

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  if (!org) { console.log('TechNova not found'); return; }

  const igAccount = await prisma.instagramAccount.findFirst({ where: { organizationId: org.id } });
  console.log('IG Account:', igAccount?.igUserId, igAccount?.igUsername, igAccount?.id);

  const leads = await prisma.lead.findMany({ where: { organizationId: org.id, source: 'INSTAGRAM_DM' } });
  console.log('Leads:', leads.map(l => ({ id: l.id, status: l.status, igUserId: l.instagramUserId })));
  
  const waAccount = await prisma.whatsAppAccount.findFirst({ where: { organizationId: org.id } });
  console.log('WA Account:', waAccount?.phoneNumberId, waAccount?.id);
}
main().finally(() => process.exit(0));
