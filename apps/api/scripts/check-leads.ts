import { prisma } from '../src/core/prisma/client.js';

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  if (org) {
    const leads = await prisma.lead.findMany({ 
      where: { organizationId: org.id },
      select: { id: true, firstName: true, instagramUserId: true, facebookUserId: true, source: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    console.log('\nRecent Leads:', leads);
    
    const igConvs = await prisma.instagramConversation.findMany({ 
      where: { organizationId: org.id },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log('\nRecent Conversations:', igConvs.map(c => ({ platform: c.platform, igAccountId: c.igAccountId, igConversationId: c.igConversationId })));
  }
}
main().finally(() => process.exit(0));
