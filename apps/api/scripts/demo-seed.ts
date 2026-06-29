import { PrismaClient, LeadStatus, LeadSource, TaskType, TaskPriority, TaskStatus, DealStatus, ActivityType, WorkflowRunStatus, SubscriptionPlan } from '@prisma/client';
import { OrganizationRepository } from '../src/modules/organizations/organization.repository.js';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'LeadOS@123';

const ORGS = [
  {
    name: 'TechNova Solutions',
    slug: 'technova',
    users: [
      { email: 'owner@technova.demo', role: 'OWNER', firstName: 'Sarah', lastName: 'Connor' },
      { email: 'admin@technova.demo', role: 'ADMIN', firstName: 'John', lastName: 'Smith' },
      { email: 'manager@technova.demo', role: 'MANAGER', firstName: 'Emily', lastName: 'Chen' },
      { email: 'sales1@technova.demo', role: 'SALES_EXECUTIVE', firstName: 'Michael', lastName: 'Jordan' },
      { email: 'sales2@technova.demo', role: 'SALES_EXECUTIVE', firstName: 'David', lastName: 'Kim' },
      { email: 'support@technova.demo', role: 'SUPPORT', firstName: 'Lisa', lastName: 'Wong' },
    ]
  },
  {
    name: 'GrowthBridge Marketing',
    slug: 'growthbridge',
    users: [
      { email: 'owner@growthbridge.demo', role: 'OWNER', firstName: 'Robert', lastName: 'Fox' },
      { email: 'admin@growthbridge.demo', role: 'ADMIN', firstName: 'Emma', lastName: 'Watson' },
      { email: 'manager@growthbridge.demo', role: 'MANAGER', firstName: 'James', lastName: 'Bond' },
      { email: 'sales1@growthbridge.demo', role: 'SALES_EXECUTIVE', firstName: 'William', lastName: 'Tell' },
      { email: 'sales2@growthbridge.demo', role: 'SALES_EXECUTIVE', firstName: 'Oliver', lastName: 'Twist' },
      { email: 'support@growthbridge.demo', role: 'SUPPORT', firstName: 'Sophia', lastName: 'Loren' },
    ]
  },
  {
    name: 'Ayurda Clinics',
    slug: 'ayurda',
    users: [
      { email: 'owner@ayurda.demo', role: 'OWNER', firstName: 'Dr. Arjun', lastName: 'Reddy' },
      { email: 'admin@ayurda.demo', role: 'ADMIN', firstName: 'Priya', lastName: 'Sharma' },
      { email: 'manager@ayurda.demo', role: 'MANAGER', firstName: 'Rahul', lastName: 'Gupta' },
      { email: 'sales1@ayurda.demo', role: 'SALES_EXECUTIVE', firstName: 'Neha', lastName: 'Singh' },
      { email: 'support@ayurda.demo', role: 'SUPPORT', firstName: 'Amit', lastName: 'Patel' },
    ]
  }
];

const LEAD_STATUS_DISTRIBUTION = [
  ...Array(25).fill(LeadStatus.NEW),
  ...Array(20).fill(LeadStatus.CONTACTED),
  ...Array(20).fill(LeadStatus.QUALIFIED),
  ...Array(15).fill(LeadStatus.PROPOSAL),
  ...Array(10).fill(LeadStatus.NEGOTIATION),
  ...Array(5).fill(LeadStatus.WON),
  ...Array(5).fill(LeadStatus.LOST),
];

function getRandomAiScore() {
  const rand = Math.random();
  if (rand < 0.2) return faker.number.int({ min: 90, max: 100 }); // High
  if (rand < 0.5) return faker.number.int({ min: 70, max: 89 }); // Medium
  if (rand < 0.8) return faker.number.int({ min: 40, max: 69 }); // Low
  return faker.number.int({ min: 0, max: 39 }); // Very Low
}

async function main() {
  console.log('[demo-seed] Starting rich demo data generation...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 1. Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@leados.demo' },
    update: { isSuperAdmin: true, passwordHash },
    create: {
      email: 'superadmin@leados.demo',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Superadmin',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      isSuperAdmin: true,
      lastLoginAt: new Date(),
    },
  });
  console.log(`[demo-seed] Verified superadmin@leados.demo`);

  const repo = new OrganizationRepository();

  // 1.5 System Organization
  console.log(`\n[demo-seed] Setting up LeadOS System organization...`);
  let systemOrg = await prisma.organization.findUnique({ where: { slug: 'leados-system' } });
  if (!systemOrg) {
    systemOrg = await repo.createOrganizationWithDefaults('LeadOS System', superAdmin.id, {
      industry: 'Software',
      timezone: 'UTC',
    });
    systemOrg = await prisma.organization.update({
      where: { id: systemOrg.id },
      data: { slug: 'leados-system' }
    });
  } else {
    // Ensure membership exists
    const roles = await prisma.role.findMany({ where: { organizationId: systemOrg.id } });
    const ownerRole = roles.find(r => r.name === 'OWNER');
    if (ownerRole) {
      await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: systemOrg.id, userId: superAdmin.id } },
        update: {},
        create: {
          organizationId: systemOrg.id,
          userId: superAdmin.id,
          roleId: ownerRole.id,
          status: 'ACTIVE'
        }
      });
    }
  }
  console.log(`[demo-seed] Assigned superadmin@leados.demo to LeadOS System`);

  for (const orgData of ORGS) {
    console.log(`\n[demo-seed] Setting up ${orgData.name}...`);
    
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
      // Force slug to what we want
      org = await prisma.organization.update({
        where: { id: org.id },
        data: { slug: orgData.slug }
      });
      
      // Upsert subscription to SCALE for full features
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

    const orgRoles = await prisma.role.findMany({ where: { organizationId: org.id } });
    
    // Create users & assign to org
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

    // Create Pipeline
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

    // CREATE LEADS (100)
    console.log(`[demo-seed] Creating 100 Leads for ${org.name}...`);
    const leadIds: string[] = [];
    for (let i = 0; i < 100; i++) {
      const assignee = salesUsers[i % salesUsers.length];
      const status = LEAD_STATUS_DISTRIBUTION[i % 100];
      const score = getRandomAiScore();
      
      const lead = await prisma.lead.create({
        data: {
          organizationId: org.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          email: faker.internet.email(),
          phone: faker.phone.number().substring(0, 20),
          source: i % 5 === 0 ? LeadSource.IMPORT : LeadSource.MANUAL,
          status,
          assignedToId: assignee.id,
          createdById: owner.id,
          aiScore: score,
          aiScoreUpdatedAt: new Date(),
          pipelineStageId: stages[Math.floor(Math.random() * stages.length)]?.id,
          lastActivityAt: faker.date.recent({ days: 30 })
        }
      });
      leadIds.push(lead.id);
      
      // AiScore history
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

    // CREATE CONTACTS (50)
    console.log(`[demo-seed] Creating 50 Contacts for ${org.name}...`);
    const contactIds: string[] = [];
    for (let i = 0; i < 50; i++) {
      const assignee = salesUsers[i % salesUsers.length];
      // Tie some contacts back to leads for Customer360
      const fromLeadId = i < 20 ? leadIds[i] : null; 
      
      const contact = await prisma.contact.create({
        data: {
          organizationId: org.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          email: faker.internet.email(),
          company: faker.company.name(),
          jobTitle: faker.person.jobTitle(),
          assignedToId: assignee.id,
          createdById: owner.id,
          createdFromLeadId: fromLeadId,
          lastActivityAt: faker.date.recent({ days: 30 })
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

    // CREATE DEALS (25)
    console.log(`[demo-seed] Creating 25 Deals for ${org.name}...`);
    const dealIds: string[] = [];
    for (let i = 0; i < 25; i++) {
      const assignee = salesUsers[i % salesUsers.length];
      const stage = stages[Math.floor(Math.random() * stages.length)];
      // Tie deals to Customer360 core targets
      const cId = i < 20 ? contactIds[i] : contactIds[Math.floor(Math.random() * contactIds.length)];
      const lId = i < 20 ? leadIds[i] : null;

      const deal = await prisma.deal.create({
        data: {
          organizationId: org.id,
          pipelineId: pipeline.id,
          stageId: stage.id,
          title: `${faker.company.name()} - ${faker.commerce.productName()} Deal`,
          value: faker.number.int({ min: 1000, max: 50000 }),
          currency: 'USD',
          status: DealStatus.OPEN,
          assignedToId: assignee.id,
          createdById: owner.id,
          contactId: cId,
          leadId: lId
        }
      });
      dealIds.push(deal.id);
    }

    // CREATE TASKS (30)
    console.log(`[demo-seed] Creating 30 Tasks for ${org.name}...`);
    for (let i = 0; i < 30; i++) {
      const assignee = salesUsers[i % salesUsers.length];
      const types = Object.values(TaskType);
      
      await prisma.task.create({
        data: {
          organizationId: org.id,
          title: `Follow up task ${i}`,
          type: types[Math.floor(Math.random() * types.length)],
          priority: TaskPriority.HIGH,
          status: i % 3 === 0 ? TaskStatus.COMPLETED : TaskStatus.PENDING,
          dueDate: faker.date.soon({ days: 14 }),
          assignedToId: assignee.id,
          createdById: owner.id,
          relatedLeadId: i < 20 ? leadIds[i] : null,
          relatedContactId: i < 20 ? contactIds[i] : null,
          relatedDealId: i < 20 ? dealIds[i] : null,
        }
      });
    }

    // CREATE NOTES (100)
    console.log(`[demo-seed] Creating 100 Notes for ${org.name}...`);
    for (let i = 0; i < 100; i++) {
      await prisma.note.create({
        data: {
          organizationId: org.id,
          content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: faker.lorem.paragraph() }] }] },
          createdById: owner.id,
          relatedLeadId: i < 50 ? leadIds[i % 50] : null,
        }
      });
    }

    // CREATE ACTIVITIES (1000)
    console.log(`[demo-seed] Creating 1000 Activities for ${org.name}...`);
    const activitiesToCreate = [];
    const activityTypesList = Object.values(ActivityType);
    for (let i = 0; i < 1000; i++) {
      const leadId = leadIds[i % leadIds.length];
      activitiesToCreate.push({
        organizationId: org.id,
        type: activityTypesList[Math.floor(Math.random() * activityTypesList.length)],
        description: `Automated demo activity ${i}`,
        performedById: owner.id,
        relatedLeadId: leadId,
        createdAt: faker.date.recent({ days: 60 })
      });
    }
    // Batch insert activities
    const batchSize = 250;
    for (let i = 0; i < activitiesToCreate.length; i += batchSize) {
      await prisma.activity.createMany({ data: activitiesToCreate.slice(i, i + batchSize) });
    }

    // CREATE WORKFLOWS & RUNS (50)
    console.log(`[demo-seed] Creating Workflows & Runs for ${org.name}...`);
    const wf1 = await prisma.workflow.create({
      data: {
        organizationId: org.id,
        name: 'Lead Score Follow-up',
        triggerType: 'LEAD_SCORE_CHANGED',
        definition: { triggerConfig: { minScore: 80 } },
        isActive: true,
      }
    });

    const wf2 = await prisma.workflow.create({
      data: {
        organizationId: org.id,
        name: 'No Response WhatsApp',
        triggerType: 'LEAD_NO_RESPONSE',
        definition: { triggerConfig: { daysInactivity: 3 } },
        isActive: true,
      }
    });

    for (let i = 0; i < 50; i++) {
      await prisma.workflowRun.create({
        data: {
          organizationId: org.id,
          workflowId: i % 2 === 0 ? wf1.id : wf2.id,
          status: WorkflowRunStatus.COMPLETED,
          triggerEvent: { source: 'seed', event: 'demo' },
          createdAt: faker.date.recent({ days: 10 }),
          actionLogs: [{ message: 'Executed action CREATE_TASK successfully' }]
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
