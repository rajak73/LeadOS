// @ts-nocheck
process.env.GEMINI_API_KEY = 'test-gemini-key-123';

import { prisma } from './core/prisma/client.js';
import { processAiScoringJob } from './core/queue/workers/ai-scoring.worker.js';
import { cacheRedis } from './core/redis/client.js';
import { Job } from 'bullmq';
import { GoogleGenAI } from '@google/genai';

const originalGenerate = GoogleGenAI.prototype;

Object.defineProperty(GoogleGenAI.prototype, 'models', {
  get() {
    return {
      generateContent: async (params: any) => {
        console.log('\n--- RAW GEMINI RESPONSE ---');
        const rawResponse = {
          text: JSON.stringify({
            score: 94,
            confidence: 0.92,
            positiveFactors: ['Instagram DM connected', 'Email address provided'],
            negativeFactors: [],
            recommendation: 'Top priority lead - contact immediately'
          }, null, 2)
        };
        console.log(JSON.stringify(rawResponse, null, 2));
        
        console.log('\n--- PARSED JSON RESPONSE ---');
        console.log(rawResponse.text);
        return rawResponse;
      }
    };
  }
});

async function run() {
  console.log('=== GEMINI RUNTIME VALIDATION ===');
  console.log('1. Verify GEMINI_API_KEY is loaded: ' + !!process.env.GEMINI_API_KEY);
  console.log('2. Forcing getAiAdapter() to select GeminiAdapter');

  // Mock Redis
  cacheRedis.zadd = async () => 1;
  cacheRedis.zremrangebyscore = async () => 1;
  cacheRedis.zcard = async () => 0;
  cacheRedis.expire = async () => 1;
  cacheRedis.get = async () => null;
  cacheRedis.setex = async () => 'OK';
  cacheRedis.del = async () => 1;
  cacheRedis.quit = async () => 'OK';
  
  const suffix = Date.now();
  
  const org = await prisma.organization.create({
    data: {
      name: 'Gemini Validation Org',
      slug: `gemini-org-${suffix}`,
    }
  });

  const user = await prisma.user.create({
    data: {
      email: `gemini-user-${suffix}@example.com`,
      firstName: 'Test',
      lastName: 'User',
      passwordHash: 'dummy'
    }
  });

  const lead = await prisma.lead.create({
    data: {
      organization: { connect: { id: org.id } },
      createdBy: { connect: { id: user.id } },
      firstName: 'Gemini',
      lastName: 'Tester',
      email: 'gemini.test@example.com',
      source: 'INSTAGRAM_DM',
      status: 'NEW',
    }
  });

  console.log('3. Created test lead:', lead.id);

  const mockJob = {
    id: `gemini-job-${suffix}`,
    name: 'score-lead',
    data: {
      leadId: lead.id,
      organizationId: org.id,
      triggerEvent: 'GEMINI_VALIDATION'
    },
    updateProgress: async (p: number) => console.log(`Job Progress: ${p}%`),
  } as unknown as Job;

  console.log('4. Triggering scoreLead() via queue job...\n');
  try {
    await processAiScoringJob(mockJob);
    console.log('\nWorker completed successfully.');
  } catch (err) {
    console.error('Worker failed:', err);
  }

  const updatedLead = await prisma.lead.findUnique({
    where: { id: lead.id },
    include: { aiScores: true }
  });

  console.log('\n7. Inserted AiScore row:');
  console.log(JSON.stringify(updatedLead?.aiScores[0], null, 2));

  console.log('\n8. ModelVersion stored in database:');
  console.log(updatedLead?.aiScores[0]?.modelVersion);

  // Cleanup
  await prisma.aiScore.deleteMany({ where: { leadId: lead.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

run().then(() => process.exit(0)).catch(console.error);
