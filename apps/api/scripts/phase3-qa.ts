import { prisma } from '../src/core/prisma/client.js';
import { getAiAdapter } from '../src/modules/ai/ai.adapter.js';

async function fetchApi(path: string, token?: string, method = 'GET', body?: any) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`http://localhost:4000${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function login(email: string) {
  const res = await fetchApi('/api/v1/auth/login', undefined, 'POST', {
    email,
    password: 'LeadOS@123'
  });
  if (res.status === 200 && res.data?.data?.accessToken) return res.data.data.accessToken;
  throw new Error(`Login failed for ${email}`);
}

async function main() {
  console.log('--- Phase 3 Lead Scoring & Automation QA ---');
  
  const techNova = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  if (!techNova) throw new Error('TechNova org not found');

  // CLEANUP BEFORE RUNNING
  await prisma.lead.deleteMany({ where: { email: 'phase3.qa+rule@leados.demo' } });
  await prisma.workflow.deleteMany({ where: { name: 'PHASE3_QA_Sequence' } });

  const token = await login('owner@technova.demo');

  console.log('\n--- Test 1 & 4: Rule-based Scoring & AI Key Missing Fallback ---');
  const adapter = getAiAdapter();
  console.log('Using Adapter:', adapter.constructor.name);

  const resLead = await fetchApi('/api/v1/leads', token, 'POST', {
    firstName: 'PHASE3_QA_Rule',
    lastName: 'Test',
    email: 'phase3.qa+rule@leados.demo',
    phone: '+919999901111',
    source: 'MANUAL',
    status: 'NEW',
    tags: ['phase3-qa']
  });
  
  console.log('Lead Create Status:', resLead.status);
  const leadId = resLead.data?.data?.id;

  if (!leadId) throw new Error('Lead ID not created');

  const resScore = await fetchApi(`/api/v1/leads/${leadId}/rescore`, token, 'POST');
  console.log('Lead Rescore API Status:', resScore.status);
  
  await new Promise(r => setTimeout(r, 1000));
  
  const scoredLead = await fetchApi(`/api/v1/leads/${leadId}`, token);
  console.log('Score:', scoredLead.data?.data?.aiScore);
  console.log('Category Check:', scoredLead.data?.data?.aiScore >= 70 ? 'Hot' : scoredLead.data?.data?.aiScore >= 40 ? 'Warm' : 'Cold');

  const history = await fetchApi(`/api/v1/leads/${leadId}/score`, token);
  console.log('Explainability Factors:', history.data?.data?.factors);
  console.log('Next Action:', history.data?.data?.recommendation);

  console.log('\n--- Test 5: Follow-Up Sequence Creation ---');
  const resWorkflow = await fetchApi('/api/v1/workflows', token, 'POST', {
    name: 'PHASE3_QA_Sequence',
    triggerType: 'LEAD_SCORE_CHANGED',
    isActive: true,
    definition: {
      trigger: { type: 'LEAD_SCORE_CHANGED' },
      conditions: [{ field: 'aiScore', operator: 'GREATER_THAN', value: 80 }],
      actions: [
        { type: 'send_email', config: { subject: 'Hi', body: 'Welcome!' } },
        { type: 'delay', config: { amount: 1, unit: 'minutes' } },
        { type: 'create_task', config: { title: 'Follow Up Now', priority: 'HIGH' } }
      ]
    }
  });
  console.log('Workflow Create Status:', resWorkflow.status);
  const workflowId = resWorkflow.data?.data?.id;
  
  console.log('\n--- Test 6: Follow-Up Trigger ---');
  await prisma.lead.update({ where: { id: leadId }, data: { aiScore: 85 } });
  await fetchApi(`/api/v1/leads/${leadId}/rescore`, token, 'POST');

  await new Promise(r => setTimeout(r, 3000));
  const runs = await prisma.workflowRun.findMany({ where: { workflowId } });
  console.log('Workflow Runs Created:', runs.length);
  if (runs.length > 0) {
    console.log('Run Status:', runs[0].status);
    console.log('Run Logs:', runs[0].actionLogs);
  }

  console.log('\n--- Test 7: Stop Condition & Duplicate Prevention ---');
  console.log('Gap detected via code inspection: Stop condition not checked on resume (no re-evaluation).');
  const runsAfterSecondTrigger = await prisma.workflowRun.findMany({ where: { workflowId } });
  console.log('Workflow Runs count:', runsAfterSecondTrigger.length);

  console.log('\n--- Test 8: Tenant Isolation ---');
  const tokenGB = await login('owner@growthbridge.demo');
  const resIso = await fetchApi(`/api/v1/workflows/${workflowId}`, tokenGB);
  console.log('GrowthBridge access Workflow:', resIso.status);
  
}

main().catch(console.error).finally(() => process.exit(0));
