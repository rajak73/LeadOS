import { PrismaClient } from '@prisma/client';

// Manual QA Script: Verify results of simulated webhook ingestion and processing
// Usage: tsx verify-social-smoke-results.ts

const prisma = new PrismaClient();

async function run() {
  console.log('--- Social Automation Smoke Test Verification ---');

  try {
    // 1. Check WebhookEvent table for recent simulated events
    const events = await prisma.webhookEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    console.log('\n[1] Recent WebhookEvents:');
    if (events.length === 0) {
      console.log('No recent events found.');
    } else {
      events.forEach((e) => {
        console.log(`- ID: ${e.id} | Status: ${e.status} | Source: ${e.source} | ExternalEventId: ${e.externalEventId}`);
        if (e.errorMessage) {
          console.log(`  Error: ${e.errorMessage}`);
        }
      });
    }

    // 2. Check Leads
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    console.log('\n[2] Recent Leads:');
    if (leads.length === 0) {
      console.log('No recent leads found.');
    } else {
      leads.forEach((l) => {
        console.log(`- Lead ID: ${l.id} | Name: ${l.firstName} ${l.lastName || ''} | Phone: ${l.phone} | State: ${(l.customFields as any)?.captureState}`);
      });
    }

    // 3. Check Instagram Conversations
    const igConversations = await prisma.instagramConversation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    console.log('\n[3] Recent Instagram Conversations:');
    if (igConversations.length === 0) {
      console.log('No recent IG conversations found.');
    } else {
      igConversations.forEach((c) => {
        console.log(`- Conv ID: ${c.id} | Status: ${c.status} | LeadId: ${c.leadId}`);
      });
    }

    // 4. Check Messages
    const messages = await prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    console.log('\n[4] Recent Messages (IG):');
    if (messages.length === 0) {
      console.log('No recent messages found.');
    } else {
      messages.forEach((m) => {
        console.log(`- Msg ID: ${m.id} | Direction: ${m.direction} | Status: ${m.status}`);
        console.log(`  Content: ${JSON.stringify(m.content)}`);
      });
    }

    // 5. Check Activities
    const activities = await prisma.activity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    console.log('\n[5] Recent Activities:');
    if (activities.length === 0) {
      console.log('No recent activities found.');
    } else {
      activities.forEach((a) => {
        console.log(`- Activity ID: ${a.id} | Type: ${a.type} | Title: ${a.title}`);
        console.log(`  Description: ${a.description}`);
      });
    }

    console.log('\nSmoke test verification query completed successfully.');
  } catch (err) {
    console.error('❌ Error during verification:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
