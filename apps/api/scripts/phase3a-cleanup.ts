import { prisma } from '../src/core/prisma/client.js';

async function main() {
  console.log('--- Phase 3A Cleanup ---');
  await prisma.workflowRun.deleteMany({ where: { workflow: { name: { startsWith: 'PHASE3' } } } });
  await prisma.workflow.deleteMany({ where: { name: { startsWith: 'PHASE3' } } });
  await prisma.whatsAppConversation.deleteMany({ where: { lead: { firstName: { startsWith: 'PHASE3' } } } });
  await prisma.lead.deleteMany({ where: { firstName: { startsWith: 'PHASE3' } } });
  await prisma.lead.deleteMany({ where: { email: { startsWith: 'phase3.qa' } } });
  
  console.log('Cleanup Done');
}
main().catch(console.error).finally(() => process.exit(0));
