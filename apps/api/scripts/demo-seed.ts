import { PrismaClient, LeadStatus, LeadSource, TaskType, TaskPriority, TaskStatus, DealStatus, ActivityType, WorkflowRunStatus, SubscriptionPlan, MessageDirection, MessageStatus } from '@prisma/client';
import { OrganizationRepository } from '../src/modules/organizations/organization.repository.js';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

// --- ANTI-PRODUCTION GUARDRAILS ---
if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
  console.error('Demo seed refused: production environment detected.');
  process.exit(1);
}

if (process.env.ALLOW_DEMO_SEED !== 'true') {
  console.error('Demo seed refused: set ALLOW_DEMO_SEED=true for local/staging only.');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL || '';
if (dbUrl.includes('neon.tech') && dbUrl.includes('production')) {
  console.error('Demo seed refused: DATABASE_URL appears to target production Neon.');
  process.exit(1);
}
// ----------------------------------

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'LeadOS@123';

const ORGS = [
  {
    name: 'TechNova Realty',
    slug: 'technova-realty-demo',
    users: [
      { email: 'owner@technova.example.com', role: 'OWNER', firstName: 'Sarah', lastName: 'Connor' },
      { email: 'admin@technova.example.com', role: 'ADMIN', firstName: 'John', lastName: 'Smith' },
      { email: 'sales1@technova.example.com', role: 'SALES_EXECUTIVE', firstName: 'Michael', lastName: 'Jordan' },
    ]
  },
  {
    name: 'GrowthBridge Agency',
    slug: 'growthbridge-agency-demo',
    users: [
      { email: 'owner@growthbridge.example.com', role: 'OWNER', firstName: 'Robert', lastName: 'Fox' },
      { email: 'admin@growthbridge.example.com', role: 'ADMIN', firstName: 'Emma', lastName: 'Watson' },
      { email: 'sales1@growthbridge.example.com', role: 'SALES_EXECUTIVE', firstName: 'William', lastName: 'Tell' },
    ]
  },
  {
    name: 'CureCare Clinic',
    slug: 'curecare-clinic-demo',
    users: [
      { email: 'owner@curecare.example.com', role: 'OWNER', firstName: 'Dr. Arjun', lastName: 'Reddy' },
      { email: 'admin@curecare.example.com', role: 'ADMIN', firstName: 'Priya', lastName: 'Sharma' },
      { email: 'sales1@curecare.example.com', role: 'SALES_EXECUTIVE', firstName: 'Neha', lastName: 'Singh' },
    ]
  }
];

const LEAD_STATUS_DISTRIBUTION = [
  LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.QUALIFIED, 
  LeadStatus.PROPOSAL, LeadStatus.NEGOTIATION, LeadStatus.WON, LeadStatus.LOST
];

function getRandomAiScore() {
  const rand = Math.random();
  if (rand < 0.2) return faker.number.int({ min: 90, max: 100 });
  if (rand < 0.5) return faker.number.int({ min: 70, max: 89 });
  if (rand < 0.8) return faker.number.int({ min: 40, max: 69 });
  return faker.number.int({ min: 0, max: 39 });
}

function getFakeIndianPhone(index: number) {
  return `99999${String(index).padStart(5, '0')}`;
}

async function main() {
  console.log('[demo-seed] Starting safe demo data generation...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const repo = new OrganizationRepository();

  for (const orgData of ORGS) {
    console.log(`\n[demo-seed] Setting up ${orgData.name}...`);
    
    // Create Owner first
    const ownerData = orgData.users.find(u => u.role === 'OWNER')!;
    const owner = await prisma.user.upsert({
      where: { email: ownerData.email },
      update: { passwordHash },
      create: {
        email: ownerData.email,
        passwordHash,
        firstName: ownerData.firstName,
        lastName: ownerData.lastName,
        status: 'ACTIVE',
        emailVerifiedAt: new Date()
      }
    });

    let org = await prisma.organization.findUnique({ where: { slug: orgData.slug } });
    
    if (!org) {
      org = await repo.createOrganizationWithDefaults(orgData.name, owner.id, {
        industry: 'Technology',
        timezone: 'UTC',
      });
      org = await prisma.organization.update({
        where: { id: org.id },
        data: { slug: orgData.slug }
      });
      
      await prisma.subscription.upsert({
        where: { organizationId: org.id },
        update: { plan: SubscriptionPlan.SCALE, status: 'ACTIVE' },
        create: {
          organizationId: org.id,
          plan: SubscriptionPlan.SCALE,
          status: 'ACTIVE',
        }
      });
    }

    // IDEMPOTENCY: Clear existing dynamic data for this demo org before re-seeding
    console.log(`[demo-seed] Cleaning existing data for idempotency...`);
    await prisma.activity.deleteMany({ where: { organizationId: org.id } });
    await prisma.task.deleteMany({ where: { organizationId: org.id } });
    await prisma.deal.deleteMany({ where: { organizationId: org.id } });
    await prisma.message.deleteMany({ where: { organizationId: org.id } });
    await prisma.instagramConversation.deleteMany({ where: { organizationId: org.id } });
    await prisma.instagramAccount.deleteMany({ where: { organizationId: org.id } });
    await prisma.aiScore.deleteMany({ where: { organizationId: org.id } });
    await prisma.contact.deleteMany({ where: { organizationId: org.id } });
    await prisma.lead.deleteMany({ where: { organizationId: org.id } });
    await prisma.workflowRun.deleteMany({ where: { organizationId: org.id } });
    await prisma.workflow.deleteMany({ where: { organizationId: org.id } });
    await prisma.note.deleteMany({ where: { organizationId: org.id } });

    const orgRoles = await prisma.role.findMany({ where: { organizationId: org.id } });
    
    const orgUsers = [];
    for (const u of orgData.users) {
      if (u.role === 'OWNER') {
        orgUsers.push(owner);
        continue;
      }
      
      const role = orgRoles.find(r => r.name === u.role) || orgRoles.find(r => r.name === 'SALES_EXECUTIVE');
      
      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: { passwordHash },
        create: {
          email: u.email,
          passwordHash,
          firstName: u.firstName,
          lastName: u.lastName,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        }
      });
      orgUsers.push(user);
      
      await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
        update: {},
        create: {
          organizationId: org.id,
          userId: user.id,
          roleId: role!.id,
          status: 'ACTIVE'
        }
      });
    }
    
    const salesUsers = orgUsers.filter(u => u.email.includes('sales'));
    if (salesUsers.length === 0) salesUsers.push(owner);

    let pipeline = await prisma.pipeline.findFirst({ where: { organizationId: org.id } });
    if (!pipeline) {
      pipeline = await prisma.pipeline.create({
        data: {
          organizationId: org.id,
          name: 'Main Sales Pipeline',
          isDefault: true,
        }
      });
      const stages = ['Lead In', 'Contact Made', 'Needs Defined', 'Proposal Made', 'Negotiations Started'];
      for (let i = 0; i < stages.length; i++) {
        await prisma.pipelineStage.create({
          data: {
            pipelineId: pipeline.id,
            organizationId: org.id,
            name: stages[i],
            order: i,
          }
        });
      }
    }
    const stages = await prisma.pipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: 'asc' } });

    // CREATE LEADS (15)
    console.log(`[demo-seed] Creating Leads...`);
    const leadIds: string[] = [];
    for (let i = 0; i < 15; i++) {
      const assignee = salesUsers[i % salesUsers.length];
      const status = LEAD_STATUS_DISTRIBUTION[i % LEAD_STATUS_DISTRIBUTION.length];
      const score = getRandomAiScore();
      const createdAt = faker.date.recent({ days: 30 });
      
      const lead = await prisma.lead.create({
        data: {
          organizationId: org.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          email: `lead${i}@example.com`,
          phone: getFakeIndianPhone(i),
          source: LeadSource.MANUAL,
          status,
          assignedToId: assignee.id,
          createdById: owner.id,
          aiScore: score,
          aiScoreUpdatedAt: new Date(),
          pipelineStageId: stages[Math.floor(Math.random() * stages.length)]?.id,
          lastActivityAt: createdAt,
          createdAt
        }
      });
      leadIds.push(lead.id);
      
      await prisma.aiScore.create({
        data: {
          organizationId: org.id,
          leadId: lead.id,
          score,
          factors: { positive: ['Engaged'], negative: [] },
          modelVersion: '1.0'
        }
      });
    }

    // CREATE CONTACTS (10)
    console.log(`[demo-seed] Creating Contacts...`);
    const contactIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const assignee = salesUsers[i % salesUsers.length];
      const fromLeadId = i < 5 ? leadIds[i] : null; 
      const createdAt = faker.date.recent({ days: 30 });
      
      const contact = await prisma.contact.create({
        data: {
          organizationId: org.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          email: `contact${i}@example.com`,
          company: faker.company.name(),
          jobTitle: faker.person.jobTitle(),
          assignedToId: assignee.id,
          createdById: owner.id,
          createdFromLeadId: fromLeadId,
          lastActivityAt: createdAt,
          createdAt
        }
      });
      contactIds.push(contact.id);
      
      if (fromLeadId) {
        await prisma.lead.update({
          where: { id: fromLeadId },
          data: { convertedToContactId: contact.id, status: LeadStatus.WON }
        });
      }
    }

    // CREATE DEALS (8)
    console.log(`[demo-seed] Creating Deals...`);
    const dealIds: string[] = [];
    for (let i = 0; i < 8; i++) {
      const assignee = salesUsers[i % salesUsers.length];
      const stage = stages[Math.floor(Math.random() * stages.length)];
      const cId = i < 8 ? contactIds[i] : contactIds[Math.floor(Math.random() * contactIds.length)];

      const deal = await prisma.deal.create({
        data: {
          organizationId: org.id,
          pipelineId: pipeline.id,
          stageId: stage.id,
          title: `${faker.company.name()} Deal`,
          value: faker.number.int({ min: 1000, max: 50000 }),
          currency: 'USD',
          status: DealStatus.OPEN,
          assignedToId: assignee.id,
          createdById: owner.id,
          contactId: cId,
          createdAt: faker.date.recent({ days: 30 })
        }
      });
      dealIds.push(deal.id);
    }

    // CREATE TASKS (10)
    console.log(`[demo-seed] Creating Tasks...`);
    for (let i = 0; i < 10; i++) {
      const assignee = salesUsers[i % salesUsers.length];
      const types = Object.values(TaskType);
      
      await prisma.task.create({
        data: {
          organizationId: org.id,
          title: `Follow up task ${i}`,
          type: types[Math.floor(Math.random() * types.length)],
          priority: TaskPriority.HIGH,
          status: i % 2 === 0 ? TaskStatus.COMPLETED : TaskStatus.PENDING,
          dueDate: faker.date.soon({ days: 14 }),
          assignedToId: assignee.id,
          createdById: owner.id,
          relatedLeadId: i < 5 ? leadIds[i] : null,
          relatedContactId: i >= 5 ? contactIds[i - 5] : null,
          createdAt: faker.date.recent({ days: 30 })
        }
      });
    }

    // CREATE ACTIVITIES (20)
    console.log(`[demo-seed] Creating Activities...`);
    const activitiesToCreate = [];
    const activityTypesList = Object.values(ActivityType);
    for (let i = 0; i < 20; i++) {
      activitiesToCreate.push({
        organizationId: org.id,
        type: activityTypesList[Math.floor(Math.random() * activityTypesList.length)],
        description: `Automated demo activity ${i}`,
        performedById: owner.id,
        relatedLeadId: leadIds[i % leadIds.length],
        createdAt: faker.date.recent({ days: 30 })
      });
    }
    await prisma.activity.createMany({ data: activitiesToCreate });

    // CREATE CONVERSATIONS/MESSAGES (4)
    console.log(`[demo-seed] Creating Dummy Conversations/Messages...`);
    const igAccount = await prisma.instagramAccount.create({
      data: {
        organizationId: org.id,
        accountId: `sim_ig_${org.slug}_001`,
        username: `${org.slug}_official`,
        name: org.name,
        isActive: true,
      }
    });

    for (let i = 0; i < 4; i++) {
      const leadId = leadIds[i % leadIds.length];
      const createdAt = faker.date.recent({ days: 30 });
      const convo = await prisma.instagramConversation.create({
        data: {
          organizationId: org.id,
          instagramAccountId: igAccount.id,
          instagramScopingId: `sim_scope_${i}`,
          participantId: `sim_user_${i}`,
          participantUsername: `user_${i}`,
          leadId: leadId,
          status: 'OPEN',
          lastMessageAt: new Date()
        }
      });

      await prisma.message.create({
        data: {
          organizationId: org.id,
          conversationId: convo.id,
          mid: `sim_mid_${convo.id}_1`,
          direction: MessageDirection.INBOUND,
          content: { text: "Hello, I am interested in your services." },
          status: MessageStatus.DELIVERED,
          sentAt: new Date(),
          createdAt
        }
      });

      await prisma.message.create({
        data: {
          organizationId: org.id,
          conversationId: convo.id,
          mid: `sim_mid_${convo.id}_2`,
          direction: MessageDirection.OUTBOUND,
          content: { text: "Thanks for reaching out! How can we help you?" },
          status: MessageStatus.DELIVERED,
          sentAt: new Date(),
          createdAt
        }
      });
    }
  }

  console.log('\n[demo-seed] Demo Seeding Completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
