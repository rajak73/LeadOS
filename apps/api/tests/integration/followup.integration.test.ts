import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp, isRedisUp } from '../helpers/services.js';
import { FollowupService } from '../../src/modules/tasks/followup.service.js';
import { withTenant } from '../../src/core/tenancy/with-tenant.js';

const pgUp = await isPostgresUp();
const redisUp = await isRedisUp();
const infra = pgUp && redisUp;

async function seedOrg(name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO organizations (name, slug, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    name, `${name.toLowerCase().replace(/\s/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  return row!.id;
}

async function seedUser(email: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (email, "passwordHash", "firstName", "lastName", "updatedAt")
     VALUES ($1, 'x', 'Test', 'User', now()) RETURNING id`,
    email,
  );
  return row!.id;
}

async function seedRole(orgId: string, name: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO roles (id, "organizationId", name, "isSystem", "updatedAt")
     VALUES (uuid_generate_v4(), $1::uuid, $2, true, now()) RETURNING id`,
    orgId, name,
  );
  return row!.id;
}

async function seedMember(orgId: string, userId: string, roleId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_members ("organizationId", "userId", "roleId", status, "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now())`,
    orgId, userId, roleId,
  );
}

let orgId = '';
let userId = '';

beforeAll(async () => {
  if (!infra) return;
  orgId = await seedOrg('Followup Test Org');
  userId = await seedUser(`followup-user-${Date.now()}@test.com`);
  const roleId = await seedRole(orgId, 'OWNER');
  await seedMember(orgId, userId, roleId);
});

afterAll(async () => {
  if (!infra) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    for (const table of ['activities', 'tasks', 'deals', 'leads', 'organization_members', 'roles']) {
      await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "organizationId" = $1::uuid`, orgId);
    }
    await tx.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
    await tx.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, userId);
  });
});

describe('Smart Follow-ups Sweep & Idempotency', () => {
  it('identifies stale leads and overdue deals, generating follow-up tasks idempotently', async () => {
    if (!infra) return;

    const followupService = new FollowupService();

    // 1. Create a stale lead (created 4 days ago)
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const staleLead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        firstName: 'Stale',
        lastName: 'Lead',
        status: 'NEW',
        source: 'MANUAL',
        createdById: userId,
        createdAt: fourDaysAgo,
        updatedAt: fourDaysAgo,
      },
    });

    // 2. Create an active (fresh) lead (created 1 hour ago)
    const freshLead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        firstName: 'Fresh',
        lastName: 'Lead',
        status: 'NEW',
        source: 'MANUAL',
        createdById: userId,
        createdAt: new Date(Date.now() - 3600000),
        updatedAt: new Date(Date.now() - 3600000),
      },
    });

    // 3. Create a pipeline & stage for deal
    const pipeline = await prisma.pipeline.create({
      data: {
        organizationId: orgId,
        name: 'Sales Pipeline',
      },
    });

    const stage = await prisma.pipelineStage.create({
      data: {
        organizationId: orgId,
        pipelineId: pipeline.id,
        name: 'Prospecting',
        order: 1,
      },
    });

    // 4. Create an overdue deal (expectedCloseDate in the past)
    const overdueDeal = await prisma.deal.create({
      data: {
        organizationId: orgId,
        title: 'Overdue Deal',
        pipelineId: pipeline.id,
        stageId: stage.id,
        status: 'OPEN',
        expectedCloseDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        createdById: userId,
      },
    });

    // 5. Run sweep
    const result1 = await withTenant(orgId, (db) => followupService.sweepTenant(db, orgId));
    expect(result1.leadsCreated).toBe(1);
    expect(result1.dealsCreated).toBe(1);

    // Verify task created for stale lead
    const leadTasks = await prisma.task.findMany({
      where: { relatedLeadId: staleLead.id, type: 'FOLLOW_UP' },
    });
    expect(leadTasks.length).toBe(1);
    expect(leadTasks[0]?.title).toBe('Follow up with lead: Stale Lead');
    expect(leadTasks[0]?.status).toBe('PENDING');

    // Verify activity logged for stale lead
    const leadActivities = await prisma.activity.findMany({
      where: { relatedLeadId: staleLead.id, type: 'FOLLOW_UP_CREATED' },
    });
    expect(leadActivities.length).toBe(1);

    // Verify no task created for fresh lead
    const freshLeadTasks = await prisma.task.findMany({
      where: { relatedLeadId: freshLead.id },
    });
    expect(freshLeadTasks.length).toBe(0);

    // Verify task created for overdue deal
    const dealTasks = await prisma.task.findMany({
      where: { relatedDealId: overdueDeal.id, type: 'FOLLOW_UP' },
    });
    expect(dealTasks.length).toBe(1);
    expect(dealTasks[0]?.title).toBe('Follow up on overdue deal: Overdue Deal');

    // 6. Run sweep again to verify idempotency
    const result2 = await withTenant(orgId, (db) => followupService.sweepTenant(db, orgId));
    expect(result2.leadsCreated).toBe(0);
    expect(result2.dealsCreated).toBe(0);

    // Verify count of tasks did not change
    const leadTasksAgain = await prisma.task.findMany({
      where: { relatedLeadId: staleLead.id, type: 'FOLLOW_UP' },
    });
    expect(leadTasksAgain.length).toBe(1);

    const dealTasksAgain = await prisma.task.findMany({
      where: { relatedDealId: overdueDeal.id, type: 'FOLLOW_UP' },
    });
    expect(dealTasksAgain.length).toBe(1);
  });
});
