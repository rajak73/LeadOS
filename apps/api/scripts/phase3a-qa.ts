import { prisma } from '../src/core/prisma/client.js';
import { enqueue } from '../src/core/queue/queues.js';
import { QUEUE } from '../src/core/queue/names.js';

async function main() {
  console.log('--- Phase 3A Workflow Stop Conditions QA ---');
  
  const org = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  if (!org) throw new Error('Org not found');

  // CLEANUP
  await prisma.workflowRun.deleteMany({ where: { workflow: { name: { startsWith: 'PHASE3A_QA_' } } } });
  await prisma.workflow.deleteMany({ where: { name: { startsWith: 'PHASE3A_QA_' } } });
  await prisma.lead.deleteMany({ where: { firstName: { startsWith: 'PHASE3A_QA_' } } });
  
  // Base setup
  const wf = await prisma.workflow.create({
    data: {
      organizationId: org.id,
      name: 'PHASE3A_QA_Test_WF',
      triggerType: 'LEAD_CREATED',
      isActive: true,
      definition: {
        trigger: { type: 'LEAD_CREATED' },
        conditions: [{ field: 'status', operator: 'EQUALS', value: 'NEW' }],
        actions: [
          { type: 'delay', config: { amount: 1, unit: 'minutes' } },
          { type: 'add_tag', config: { tag: 'QA_Triggered' } }
        ]
      }
    }
  });

  async function createTestLead(suffix: string) {
    return prisma.lead.create({
      data: {
        organizationId: org.id,
        firstName: `PHASE3A_QA_${suffix}`,
        source: 'MANUAL',
        status: 'NEW',
        createdById: (await prisma.user.findFirst())!.id
      }
    });
  }

  async function startRun(leadId: string) {
    const run = await prisma.workflowRun.create({
      data: {
        organizationId: org.id,
        workflowId: wf.id,
        status: 'PENDING',
        triggerEvent: { eventId: `event_${leadId}` },
        actionLogs: [{ action: 'delay', success: true, suspended: true }]
      }
    });
    return run;
  }

  async function resumeRun(runId: string, leadId: string) {
    return enqueue(QUEUE.WORKFLOW_EXECUTION, 'workflow-execution-job', {
      event: 'LEAD_CREATED',
      payload: { organizationId: org.id, id: leadId, runId, workflowId: wf.id, resumeFromIndex: 1 }
    });
  }

  console.log('\n--- Test 1: Resume continues ---');
  const lead1 = await createTestLead('Continue');
  const run1 = await startRun(lead1.id);
  await resumeRun(run1.id, lead1.id);

  console.log('\n--- Test 2: Stop on Reply ---');
  const lead2 = await createTestLead('Reply');
  const run2 = await startRun(lead2.id);
  await prisma.whatsAppConversation.create({
    data: {
      organizationId: org.id,
      accountId: org.id, // fake
      wabaConversationId: 'test_wa_' + lead2.id,
      customerPhone: '+123',
      leadId: lead2.id,
      lastInboundAt: new Date(Date.now() + 10000) // after run2.updatedAt
    }
  });
  await resumeRun(run2.id, lead2.id);

  console.log('\n--- Test 3 & 4: Stop on WON/LOST ---');
  const lead3 = await createTestLead('Won');
  const run3 = await startRun(lead3.id);
  await prisma.lead.update({ where: { id: lead3.id }, data: { status: 'WON' } });
  await resumeRun(run3.id, lead3.id);

  const lead4 = await createTestLead('Lost');
  const run4 = await startRun(lead4.id);
  await prisma.lead.update({ where: { id: lead4.id }, data: { status: 'LOST' } });
  await resumeRun(run4.id, lead4.id);

  console.log('\n--- Test 5: Re-evaluate condition ---');
  const lead5 = await createTestLead('Cond');
  const run5 = await startRun(lead5.id);
  // change status so condition fails (condition wants 'NEW', we set 'QUALIFIED')
  await prisma.lead.update({ where: { id: lead5.id }, data: { status: 'QUALIFIED' } });
  await resumeRun(run5.id, lead5.id);

  console.log('\nWaiting for worker processing...');
  await new Promise(r => setTimeout(r, 4000));

  const checkRuns = await prisma.workflowRun.findMany({ where: { workflowId: wf.id }, orderBy: { createdAt: 'asc' } });
  let idx = 1;
  for (const r of checkRuns) {
    console.log(`Run ${idx}: Status = ${r.status}, Error = ${r.error}`);
    idx++;
  }

  console.log('\n--- Test 7: Duplicate Resume Test ---');
  // run1 is already COMPLETED
  await resumeRun(run1.id, lead1.id);
  await new Promise(r => setTimeout(r, 2000));
  const r1Check = await prisma.workflowRun.findUnique({ where: { id: run1.id } });
  console.log(`Duplicate resume Status: ${r1Check?.status}, Error: ${r1Check?.error}`);

  console.log('QA Done');
}

main().catch(console.error).finally(() => process.exit(0));
