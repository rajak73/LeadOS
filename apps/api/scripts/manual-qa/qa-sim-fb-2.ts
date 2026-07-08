import { prisma } from '../../src/core/prisma/client.js';
import { processWebhookJob } from '../../src/core/queue/workers/webhook.worker.js';
import { logger } from '../../src/core/observability/logger.js';

// Override logger to force console output
logger.warn = (obj: any) => console.log('WARN:', obj);
logger.error = (obj: any) => console.log('ERROR:', obj);

async function simulateFacebook(senderId: string, text: string) {
  const payload = {
    object: 'page',
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
      source: 'INSTAGRAM',
      externalEventId: `fb2_${Date.now()}`,
      payload,
      status: 'PENDING'
    }
  });
  
  await processWebhookJob({
    id: 'test-job-fb2',
    data: { webhookEventId: event.id, source: 'INSTAGRAM' },
    attemptsMade: 0,
    opts: { attempts: 3 }
  } as any);
  
  const ev = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
  console.log(`Facebook Webhook Status for sender ${senderId}:`, ev?.status, ev?.errorMessage);
}

async function main() {
  await simulateFacebook('fb_user_1', 'Hello via Facebook Page!');
}

main().finally(() => process.exit(0));
