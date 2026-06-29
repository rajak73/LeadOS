// @ts-nocheck
import { prisma } from './core/prisma/client.js';
import { processAiScoringJob } from './core/queue/workers/ai-scoring.worker.js';
import { cacheRedis } from './core/redis/client.js';
import { Job } from 'bullmq';

async function run() {
  console.log('=== STARTING RUNTIME PROOF ===');

  // Mock Redis
  cacheRedis.zadd = async () => 1;
  cacheRedis.zremrangebyscore = async () => 1;
  cacheRedis.zcard = async () => 0;
  cacheRedis.quit = async () => 'OK';
  
  const suffix = Date.now();
  
  const org = await prisma.organization.create({
    data: {
      name: 'Test Org for Scoring',
      slug: `test-org-${suffix}`,
    }
  });

  const user = await prisma.user.create({
    data: {
      email: `test-user-${suffix}@example.com`,
      firstName: 'Test',
      lastName: 'User',
      passwordHash: 'dummy'
    }
  });

  const lead = await prisma.lead.create({
    data: {
      organization: { connect: { id: org.id } },
      createdBy: { connect: { id: user.id } },
      firstName: 'Jane',
      lastName: 'Scoring',
      email: 'jane.scoring.test@example.com',
      source: 'INSTAGRAM_DM',
      status: 'NEW',
    }
  });

  console.log('1. Created Lead:', lead.id, 'with email', lead.email);

  const mockJob = {
    id: `test-job-${suffix}`,
    name: 'score-lead',
    data: {
      leadId: lead.id,
      organizationId: org.id,
      triggerEvent: 'RUNTIME_TEST'
    },
    updateProgress: async (p: number) => console.log(`Job Progress: ${p}%`),
  } as unknown as Job;

  console.log('2. Triggering AI Scoring Worker manually...');
  try {
    await processAiScoringJob(mockJob);
    console.log('3. Worker completed successfully.');
  } catch (err) {
    console.error('Worker failed:', err);
  }

  const updatedLead = await prisma.lead.findUnique({
    where: { id: lead.id },
    include: { aiScores: true }
  });

  console.log('4. Verification Result:');
  console.log(JSON.stringify(updatedLead?.aiScores, null, 2));

  // Cleanup
  await prisma.aiScore.deleteMany({ where: { leadId: lead.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  await prisma.organizationMember.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.organization.delete({ where: { id: org.id } });

  console.log('=== END ===');
  process.exit(0);
}

run().catch(console.error);
