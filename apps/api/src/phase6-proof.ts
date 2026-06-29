// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { QUEUE } from './core/queue/names.js';
import { FollowupService } from './modules/tasks/followup.service.js';
import { AiService } from './modules/ai/ai.service.js';
import { getAiAdapter } from './modules/ai/ai.adapter.js';
import { enqueue, getQueue, closeQueues } from './core/queue/queues.js';
import { registerWorker } from './core/queue/worker-registry.js';
import { processWorkflowExecutionJob } from './core/queue/workers/workflow-execution.worker.js';

const db = new PrismaClient();
const workflowQueue = getQueue(QUEUE.WORKFLOW_EXECUTION);
const emailQueue = getQueue(QUEUE.EMAIL_DELIVERY);

async function run() {
  console.log("=== PHASE 6 RUNTIME EVIDENCE AUDIT ===\n");
  
  const worker = registerWorker(QUEUE.WORKFLOW_EXECUTION, async (job) => {
    return processWorkflowExecutionJob(job);
  });
  
  const org = await db.organization.findFirstOrThrow();
  const user = await db.user.findFirstOrThrow();
  const orgId = org.id;
  const userId = user.id;

  // Helper for lead creation
  const createLead = async (firstName: string, date?: Date) => {
    return await db.lead.create({
      data: {
        organizationId: orgId,
        createdById: userId,
        firstName,
        lastName: 'Test',
        status: 'NEW',
        email: `${firstName}@example.com`,
        ...(date ? { createdAt: date } : {})
      }
    });
  };

  // 1. LEAD_SCORE_CHANGED
  console.log("1. LEAD_SCORE_CHANGED Trigger\n");
  const lead1 = await createLead(`Score-${Date.now()}`);
  const wf1 = await db.workflow.create({
    data: {
      organizationId: orgId,
      name: `Score Change WF ${Date.now()}`,
      triggerType: 'LEAD_SCORE_CHANGED',
      isActive: true,
      definition: {
        trigger: { type: 'LEAD_SCORE_CHANGED', config: {} },
        conditions: [],
        actions: [{ type: 'add_tag', config: { tag: 'scored' } }]
      }
    }
  });

  console.log("* Simulating AI Rescoring worker logic");
  const result = { score: 85, factors: { engagement: 0.9 }, recommendation: 'Hot Lead', modelVersion: 'gemini-1.5-pro' };
  
  await db.aiScore.create({
    data: {
      organizationId: orgId,
      leadId: lead1.id,
      score: result.score,
      factors: result.factors as any,
      recommendation: result.recommendation,
      triggeredBy: 'MANUAL_RESCORE',
      modelVersion: result.modelVersion,
    },
  });
  
  await enqueue(QUEUE.WORKFLOW_EXECUTION, 'workflow-execution-job', {
    event: 'LEAD_SCORE_CHANGED',
    payload: { organizationId: orgId, id: lead1.id, score: result.score, previousScore: undefined, delta: result.score },
  });

  await new Promise(r => setTimeout(r, 2000));
  const runs1 = await db.workflowRun.findMany({ where: { workflowId: wf1.id } });
  console.log(`* Workflow Runs Created for LEAD_SCORE_CHANGED: ${runs1.length}`);
  console.log(JSON.stringify(runs1, null, 2));


  // 2. LEAD_NO_RESPONSE
  console.log("\n2. LEAD_NO_RESPONSE Trigger\n");
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - 5);
  const lead2 = await createLead(`Stale-${Date.now()}`, staleDate);
  
  const wf2 = await db.workflow.create({
    data: {
      organizationId: orgId,
      name: `No Response WF ${Date.now()}`,
      triggerType: 'LEAD_NO_RESPONSE',
      isActive: true,
      definition: {
        trigger: { type: 'LEAD_NO_RESPONSE', config: {} },
        conditions: [],
        actions: [{ type: 'add_tag', config: { tag: 'stale' } }]
      }
    }
  });

  console.log("* Running FollowupSweep Worker");
  const followupService = new FollowupService();
  await followupService.sweepTenant(db as any, orgId);

  await new Promise(r => setTimeout(r, 2000));
  const runs2 = await db.workflowRun.findMany({ where: { workflowId: wf2.id } });
  console.log(`* Workflow Runs Created for LEAD_NO_RESPONSE: ${runs2.length}`);
  console.log(JSON.stringify(runs2, null, 2));


  // 3. Delay Action
  console.log("\n3. Delay Action\n");
  const lead3Name = `Delay-${Date.now()}`;
  const lead3 = await createLead(lead3Name);
  const wf3 = await db.workflow.create({
    data: {
      organizationId: orgId,
      name: `Delay WF ${Date.now()}`,
      triggerType: 'LEAD_CREATED',
      isActive: true,
      definition: {
        trigger: { type: 'LEAD_CREATED', config: {} },
        conditions: [{ field: 'firstName', operator: 'EQUALS', value: lead3Name }],
        actions: [
          { type: 'delay', config: { amount: 1, unit: 'minutes' } },
          { type: 'create_task', config: { title: 'Delayed Task' } }
        ]
      }
    }
  });

  await enqueue(QUEUE.WORKFLOW_EXECUTION, 'workflow-execution-job', {
    event: 'LEAD_CREATED',
    payload: { organizationId: orgId, id: lead3.id }
  });

  await new Promise(r => setTimeout(r, 2000));
  const runs3 = await db.workflowRun.findMany({ where: { workflowId: wf3.id } });
  console.log(`* WorkflowRun before delay (status should be PENDING/Suspended):`);
  console.log(JSON.stringify(runs3, null, 2));

  const delayedJobs = await workflowQueue.getDelayed();
  const matchingDelayedJobs = delayedJobs.filter((j) => j.data?.payload?.organizationId === orgId && j.data?.payload?.id === lead3.id);
  console.log(`* BullMQ delayed jobs found:`);
  console.log(JSON.stringify(matchingDelayedJobs.map(j => ({ name: j.name, data: j.data, delay: j.opts.delay })), null, 2));


  // 4. Send Email Action
  console.log("\n4. Send Email Action\n");
  const lead4Name = `Email-${Date.now()}`;
  const lead4 = await createLead(lead4Name);
  const wf4 = await db.workflow.create({
    data: {
      organizationId: orgId,
      name: `Email WF ${Date.now()}`,
      triggerType: 'LEAD_CREATED',
      isActive: true,
      definition: {
        trigger: { type: 'LEAD_CREATED', config: {} },
        conditions: [{ field: 'firstName', operator: 'EQUALS', value: lead4Name }],
        actions: [
          { type: 'send_email', config: { subject: 'Test Email', body: 'Hello World' } }
        ]
      }
    }
  });

  await enqueue(QUEUE.WORKFLOW_EXECUTION, 'workflow-execution-job', {
    event: 'LEAD_CREATED',
    payload: { organizationId: orgId, id: lead4.id }
  });

  await new Promise(r => setTimeout(r, 2000));
  const runs4 = await db.workflowRun.findMany({ where: { workflowId: wf4.id } });
  console.log(`* WorkflowRuns:`);
  console.log(JSON.stringify(runs4, null, 2));

  const emailJobs = await emailQueue.getWaiting();
  const matchingEmailJobs = emailJobs.filter((j) => j.data?.organizationId === orgId && j.data?.to === lead4.email);
  console.log(`* Email queue jobs:`);
  console.log(JSON.stringify(matchingEmailJobs.map(j => ({ name: j.name, data: j.data })), null, 2));

  await closeQueues();
  await worker.close(); process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
