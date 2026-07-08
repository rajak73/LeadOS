import { prisma } from '../../src/core/prisma/client.js';
import { processWebhookJob } from '../../src/core/queue/workers/webhook.worker.js';

async function simulateInstagram(senderId: string, text: string) {
  const payload = {
    object: 'instagram',
    entry: [{
      id: 'ig_sys_acct_1',
      time: Date.now(),
      messaging: [{
        sender: { id: senderId },
        recipient: { id: 'ig_sys_acct_1' },
        timestamp: Date.now(),
        message: { mid: `mid.${Date.now()}.${Math.random()}`, text }
      }]
    }]
  };
  
  const event = await prisma.webhookEvent.create({
    data: {
      source: 'INSTAGRAM',
      externalEventId: `ig_${Date.now()}`,
      payload,
      status: 'PENDING'
    }
  });
  
  await processWebhookJob({
    id: 'test-job',
    data: { webhookEventId: event.id, source: 'INSTAGRAM' },
    attemptsMade: 0,
    opts: { attempts: 3 }
  } as any);
  
  const ev = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
  console.log(`Instagram Webhook Status for sender ${senderId}:`, ev?.status, ev?.errorMessage);
}

async function simulateWhatsApp(customerPhone: string, text: string) {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba_1',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '1234567890', phone_number_id: 'wa_phone_1' },
          contacts: [{ profile: { name: 'WA User' }, wa_id: customerPhone }],
          messages: [{
            from: customerPhone,
            id: `wamid.${Date.now()}.${Math.random()}`,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            text: { body: text },
            type: 'text'
          }]
        }
      }]
    }]
  };
  
  const event = await prisma.webhookEvent.create({
    data: {
      source: 'WHATSAPP',
      externalEventId: `wa_${Date.now()}`,
      payload,
      status: 'PENDING'
    }
  });
  
  await processWebhookJob({
    id: 'test-job-wa',
    data: { webhookEventId: event.id, source: 'WHATSAPP' },
    attemptsMade: 0,
    opts: { attempts: 3 }
  } as any);
  
  const ev = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
  console.log(`WhatsApp Webhook Status for sender ${customerPhone}:`, ev?.status, ev?.errorMessage);
}

async function main() {
  console.log('--- Test Case 1: Existing Instagram User ---');
  await simulateInstagram('ig_existing_user', 'Hello! This is an existing user test.');
  
  console.log('--- Test Case 2: New Instagram User ---');
  await simulateInstagram('ig_new_user', 'Hi, I am new here.');
  
  console.log('--- Test Case 3: WhatsApp User ---');
  await simulateWhatsApp('9876543210', 'Hello via WhatsApp!');
  
  const org = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  if (org) {
    const leads = await prisma.lead.findMany({ 
      where: { organizationId: org.id },
      select: { id: true, firstName: true, instagramUserId: true, source: true },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log('\nRecent Leads:', leads);
    
    const igConvs = await prisma.instagramConversation.findMany({ where: { organizationId: org.id }});
    console.log('\nIG Conversations:', igConvs.length);
    
    const waConvs = await prisma.whatsAppConversation.findMany({ where: { organizationId: org.id }});
    console.log('\nWA Conversations:', waConvs.length);
  }
}

main().finally(() => process.exit(0));
