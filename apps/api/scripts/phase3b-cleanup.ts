import { prisma } from '../src/core/prisma/client.js';

async function main() {
  console.log('--- Phase 3B Cleanup ---');
  await prisma.task.deleteMany({ where: { title: { startsWith: 'PHASE3B_' } } });
  await prisma.workflowRun.deleteMany({ where: { workflow: { name: { startsWith: 'PHASE3B_' } } } });
  await prisma.workflow.deleteMany({ where: { name: { startsWith: 'PHASE3B_' } } });
  await prisma.lead.deleteMany({ where: { firstName: { startsWith: 'PHASE3B_' } } });
  console.log('Cleanup Done');
}
main().catch(console.error).finally(() => process.exit(0));
