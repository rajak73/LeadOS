import { prisma } from '../src/core/prisma/client.js';
import { enqueue } from '../src/core/queue/queues.js';
import { QUEUE } from '../src/core/queue/names.js';

async function login(email: string) {
  const res = await fetch('http://localhost:4000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'LeadOS@123' })
  });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Login failed for ${email}: ${data.error?.message}`);
  return data.data.token;
}

async function apiGet(path: string, token: string) {
  const res = await fetch(`http://localhost:4000/api/v1${path}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

async function main() {
  console.log('--- Phase 3B Workflow create_task Bug Fix QA ---');
  
  const org = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  if (!org) throw new Error('Org not found');

  const ownerMember = await prisma.organizationMember.findFirst({ where: { organizationId: org.id }, orderBy: { createdAt: 'asc' } });
  if (!ownerMember) throw new Error('Owner member not found');
  const ownerId = ownerMember.userId;

  // CLEANUP
  await prisma.task.deleteMany({ where: { title: { startsWith: 'PHASE3B_QA_' } } });
  await prisma.workflowRun.deleteMany({ where: { workflow: { name: { startsWith: 'PHASE3B_QA_' } } } });
  await prisma.workflow.deleteMany({ where: { name: { startsWith: 'PHASE3B_QA_' } } });
  await prisma.lead.deleteMany({ where: { firstName: { startsWith: 'PHASE3B_QA_' } } });
  
  console.log('\n--- Test 1: create_task basic ---');
  const wf1 = await prisma.workflow.create({
    data: {
      organizationId: org.id,
      name: 'PHASE3B_QA_WF_Basic',
      triggerType: 'LEAD_CREATED',
      isActive: true,
      definition: {
        trigger: { type: 'LEAD_CREATED' },
        conditions: [],
        actions: [
          { type: 'create_task', config: { title: 'PHASE3B_QA_FollowUp', priority: 'HIGH' } }
        ]
      }
    }
  });

  const lead1 = await prisma.lead.create({
    data: { organizationId: org.id, firstName: 'PHASE3B_QA_Basic', source: 'MANUAL', createdById: ownerId }
  });

  const run1 = await prisma.workflowRun.create({
    data: {
      organizationId: org.id,
      workflowId: wf1.id,
      status: 'PENDING',
      triggerEvent: { eventId: `event_b_${lead1.id}` },
      actionLogs: []
    }
  });

  await enqueue(QUEUE.WORKFLOW_EXECUTION, 'workflow-execution-job', {
    event: 'LEAD_CREATED',
    payload: { organizationId: org.id, id: lead1.id, runId: run1.id, workflowId: wf1.id, resumeFromIndex: 0 }
  });

  console.log('\n--- Test 2: create_task after delay ---');
  const wf2 = await prisma.workflow.create({
    data: {
      organizationId: org.id,
      name: 'PHASE3B_QA_WF_Delay',
      triggerType: 'LEAD_CREATED',
      isActive: true,
      definition: {
        trigger: { type: 'LEAD_CREATED' },
        conditions: [],
        actions: [
          { type: 'delay', config: { amount: 1, unit: 'minutes' } },
          { type: 'create_task', config: { title: 'PHASE3B_QA_Delayed', priority: 'HIGH' } }
        ]
      }
    }
  });

  const lead2 = await prisma.lead.create({
    data: { organizationId: org.id, firstName: 'PHASE3B_QA_Delay', source: 'MANUAL', createdById: ownerId }
  });
  
  const run2 = await prisma.workflowRun.create({
    data: {
      organizationId: org.id,
      workflowId: wf2.id,
      status: 'PENDING',
      triggerEvent: { eventId: `event_d_${lead2.id}` },
      actionLogs: [{ action: 'delay', success: true, suspended: true }]
    }
  });

  await enqueue(QUEUE.WORKFLOW_EXECUTION, 'workflow-execution-job', {
    event: 'LEAD_CREATED',
    payload: { organizationId: org.id, id: lead2.id, runId: run2.id, workflowId: wf2.id, resumeFromIndex: 1 }
  });

  console.log('\n--- Test 3: Stop prevents task ---');
  const wf3 = await prisma.workflow.create({
    data: {
      organizationId: org.id,
      name: 'PHASE3B_QA_WF_Stop',
      triggerType: 'LEAD_CREATED',
      isActive: true,
      definition: {
        trigger: { type: 'LEAD_CREATED' },
        conditions: [],
        actions: [
          { type: 'delay', config: { amount: 1, unit: 'minutes' } },
          { type: 'create_task', config: { title: 'PHASE3B_QA_StoppedTask', priority: 'HIGH' } }
        ]
      }
    }
  });

  const lead3 = await prisma.lead.create({
    data: { organizationId: org.id, firstName: 'PHASE3B_QA_Stop', status: 'WON', source: 'MANUAL', createdById: ownerId }
  });

  const run3 = await prisma.workflowRun.create({
    data: {
      organizationId: org.id,
      workflowId: wf3.id,
      status: 'PENDING',
      triggerEvent: { eventId: `event_s_${lead3.id}` },
      actionLogs: [{ action: 'delay', success: true, suspended: true }]
    }
  });

  await enqueue(QUEUE.WORKFLOW_EXECUTION, 'workflow-execution-job', {
    event: 'LEAD_CREATED',
    payload: { organizationId: org.id, id: lead3.id, runId: run3.id, workflowId: wf3.id, resumeFromIndex: 1 }
  });


  console.log('\nWaiting for worker processing...');
  await new Promise(r => setTimeout(r, 4000));

  // Verify Tasks
  const task1 = await prisma.task.findFirst({ where: { title: 'PHASE3B_QA_FollowUp' } });
  console.log(`Test 1 Task created: ${!!task1}, creatorId: ${task1?.createdById}`);

  const task2 = await prisma.task.findFirst({ where: { title: 'PHASE3B_QA_Delayed' } });
  console.log(`Test 2 Task created: ${!!task2}, creatorId: ${task2?.createdById}`);

  const task3 = await prisma.task.findFirst({ where: { title: 'PHASE3B_QA_StoppedTask' } });
  console.log(`Test 3 Task prevented: ${!task3}`);

  console.log('\n--- Test 4: Tenant isolation ---');
  let tokenGB = null;
  try {
     tokenGB = await login('owner@growthbridge.demo');
     console.log('Login GrowthBridge: OK');
     // Attempt to fetch task1 if it exists using the API
     if (task1) {
       const res = await apiGet(`/tasks/${task1.id}`, tokenGB);
       console.log('Fetch TechNova Task via GrowthBridge Token:', res);
     }
  } catch (err: any) {
     console.log('Tenant isolation test err (expected):', err.message);
  }

  console.log('\n--- Test 5: Duplicate resume ---');
  await enqueue(QUEUE.WORKFLOW_EXECUTION, 'workflow-execution-job', {
    event: 'LEAD_CREATED',
    payload: { organizationId: org.id, id: lead1.id, runId: run1.id, workflowId: wf1.id, resumeFromIndex: 0 }
  });
  await new Promise(r => setTimeout(r, 2000));
  const duplicateTasks = await prisma.task.findMany({ where: { title: 'PHASE3B_QA_FollowUp' } });
  console.log(`Test 5 Duplicates avoided: ${duplicateTasks.length === 1}`);

  console.log('QA Done');
}

main().catch(console.error).finally(() => process.exit(0));
