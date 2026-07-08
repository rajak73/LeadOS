import { prisma } from '../../src/core/prisma/client.js';
import { processWebhookJob } from '../../src/core/queue/workers/webhook.worker.js';

async function simulateFacebook(senderId: string, text: string) {
  const payload = {
    object: 'page',
    entry: [{
      id: 'fb_page_2',
      time: Date.now(),
      messaging: [{
        sender: { id: senderId },
        recipient: { id: 'fb_page_2' },
        timestamp: Date.now(),
        message: { mid: `m_${Date.now()}_${Math.random()}`, text }
      }]
    }]
  };
  
  const event = await prisma.webhookEvent.create({
    data: {
      source: 'INSTAGRAM',
      externalEventId: `fb3_${Date.now()}`,
      payload,
      status: 'PENDING'
    }
  });
  
  await processWebhookJob({
    id: 'test-job-fb3',
    data: { webhookEventId: event.id, source: 'INSTAGRAM' },
    attemptsMade: 0,
    opts: { attempts: 3 }
  } as any);
  
  const ev = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
  console.log(`Facebook Webhook Status for sender ${senderId}:`, ev?.status, ev?.errorMessage);
}

async function main() {
  await simulateFacebook('fb_user_new', 'Hello via FB Page 2!');
  
  const org = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  if (org) {
    const leads = await prisma.lead.findMany({ 
      where: { organizationId: org.id },
      select: { id: true, firstName: true, facebookUserId: true, source: true },
      orderBy: { createdAt: 'desc' },
      take: 2
    });
    console.log('\nRecent Leads:', leads);
    
    const igConvs = await prisma.instagramConversation.findMany({ 
      where: { organizationId: org.id },
      orderBy: { createdAt: 'desc' },
      take: 2
    });
    console.log('\nRecent Conversations:', igConvs.map(c => ({ platform: c.platform, igAccountId: c.igAccountId })));
  }
}
main().finally(() => process.exit(0));
