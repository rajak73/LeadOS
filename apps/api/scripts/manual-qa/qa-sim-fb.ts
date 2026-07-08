import { prisma } from '../../src/core/prisma/client.js';
import { processWebhookJob } from '../../src/core/queue/workers/webhook.worker.js';

async function simulateFacebook(senderId: string, text: string) {
  const payload = {
    object: 'page', // Facebook webhooks use 'page' instead of 'instagram'
    entry: [{
      id: 'fb_page_1',
      time: Date.now(),
      messaging: [{
        sender: { id: senderId },
        recipient: { id: 'fb_page_1' },
        timestamp: Date.now(),
        message: { mid: `m_${Date.now()}_${Math.random()}`, text }
      }]
    }]
  };
  
  const event = await prisma.webhookEvent.create({
    data: {
      source: 'INSTAGRAM', // Note: FB uses same webhook controller as IG? Actually, check if 'page' is handled!
      externalEventId: `fb_${Date.now()}`,
      payload,
      status: 'PENDING'
    }
  });
  
  await processWebhookJob({
    id: 'test-job-fb',
    data: { webhookEventId: event.id, source: 'INSTAGRAM' }, // Or is it SYSTEM? Let's check handleInstagram
    attemptsMade: 0,
    opts: { attempts: 3 }
  } as any);
  
  const ev = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
  console.log(`Facebook Webhook Status for sender ${senderId}:`, ev?.status, ev?.errorMessage);
}

async function main() {
  console.log('--- Test Case 4: Facebook Message ---');
  await simulateFacebook('fb_user_1', 'Hello via Facebook Page!');
  
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
