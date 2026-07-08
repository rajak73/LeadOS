import { prisma } from '../src/core/prisma/client.js';

async function main() {
  console.log('--- Phase 4 API Verification (Direct Service) ---');
  
  // 3. Fetch TechNova leads
  const org = await prisma.organization.findFirst({ where: { slug: 'technova' } });
  if (!org) throw new Error('TechNova org not found');
  
  const lead = await prisma.lead.findFirst({ where: { organizationId: org.id } });
  if (!lead) {
      console.log('No lead found');
  } else {
    console.log(`Lead fetched: ${lead.id}, aiScore: ${lead.aiScore}`);
    
    // Fetch AI Score details
    const scoreFactors = await prisma.leadScoreFactor.findMany({ where: { leadId: lead.id } });
    console.log(`AI Score details: score=${lead.aiScore}, factors count=${scoreFactors.length}`);
  }
  
  // 4. Fetch Workflows
  const workflows = await prisma.workflow.findMany({ where: { organizationId: org.id } });
  console.log(`Workflows fetched: count=${workflows.length}`);
  if (workflows.length > 0) {
    const wf = workflows[0];
    console.log(`Workflow details fetched: id=${wf.id}, name=${wf.name}`);
  }
  
  console.log('--- Phase 4 API Verification Complete ---');
}
main().catch(console.error).finally(() => process.exit(0));
