import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/core/prisma/client.js';
import { isPostgresUp, isRedisUp } from '../helpers/services.js';
import { signAccessToken } from '../../src/core/auth/jwt.js';
import { processWorkflowExecutionJob } from '../../src/core/queue/workers/workflow-execution.worker.js';
import { MAX_WORKFLOW_DEPTH } from '../../src/modules/workflow/workflow.actions.js';

const pgUp = await isPostgresUp();
const redisUp = await isRedisUp();
const infra = pgUp && redisUp;

const app = buildApp();

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
let ownerId = '';
let ownerToken = '';

beforeAll(async () => {
  if (!infra) return;
  orgId = await seedOrg('Workflow Integration Org');
  ownerId = await seedUser(`wf-owner-${Date.now()}@test.com`);
  const roleId = await seedRole(orgId, 'OWNER');
  await seedMember(orgId, ownerId, roleId);
  ownerToken = signAccessToken({ sub: ownerId, orgId, role: 'OWNER', isSuperAdmin: false });
});

afterAll(async () => {
  if (!infra) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    for (const table of ['workflow_runs', 'workflows', 'leads', 'organization_members', 'roles']) {
      await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "organizationId" = $1::uuid`, orgId);
    }
    await tx.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, orgId);
    await tx.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, ownerId);
  });
});

describe('Workflow REST API & Execution', () => {
  it('GET /api/v1/workflows/meta -> returns catalog', async () => {
    if (!infra) return;
    const res = await request(app)
      .get('/api/v1/workflows/meta')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.triggers).toContain('LEAD_CREATED');
    expect(res.body.data.actions.map((a: any) => a.type)).toContain('update_lead_status');
  });

  it('POST /api/v1/workflows -> rejects invalid definition', async () => {
    if (!infra) return;
    const res = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Invalid Workflow',
        triggerType: 'LEAD_CREATED',
        definition: {
          trigger: { type: 'INVALID_TRIGGER' },
          actions: []
        }
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WORKFLOW_INVALID_DEFINITION');
  });

  it('POST /api/v1/workflows -> creates workflow successfully', async () => {
    if (!infra) return;
    const res = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Auto Assign Lead',
        triggerType: 'LEAD_CREATED',
        definition: {
          trigger: { type: 'LEAD_CREATED' },
          conditions: [
            { field: 'source', operator: 'EQUALS', value: 'WEB_FORM' }
          ],
          actions: [
            { type: 'add_tag', config: { tag: 'auto-processed' } }
          ]
        },
        isActive: true
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Auto Assign Lead');
    expect(res.body.data.isActive).toBe(true);
  });

  it('End-to-end execution -> runs workflow and applies actions', async () => {
    if (!infra) return;
    
    // Create workflow
    const wfRes = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Status Change Tag',
        triggerType: 'LEAD_STATUS_CHANGED',
        definition: {
          trigger: { type: 'LEAD_STATUS_CHANGED' },
          conditions: [
            { field: 'status', operator: 'EQUALS', value: 'QUALIFIED' }
          ],
          actions: [
            { type: 'add_tag', config: { tag: 'status-qualified' } }
          ]
        },
        isActive: true
      });
    const wfId = wfRes.body.data.id;

    // Create a lead
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        firstName: 'Workflow',
        lastName: 'Test',
        source: 'MANUAL',
        status: 'NEW',
        createdById: ownerId
      }
    });

    // Update lead status to trigger
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'QUALIFIED' }
    });

    const eventId = `test-evt-${Date.now()}`;

    // Invoke BullMQ worker manually
    const job = {
      id: eventId,
      data: {
        event: 'LEAD_STATUS_CHANGED',
        payload: {
          id: lead.id,
          organizationId: orgId,
          eventId
        }
      }
    } as any;

    await processWorkflowExecutionJob(job);

    // Assert Lead has the tag added
    const processedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(processedLead?.tags).toContain('status-qualified');

    // Assert WorkflowRun log is recorded as COMPLETED
    const runs = await prisma.workflowRun.findMany({ where: { workflowId: wfId } });
    expect(runs.length).toBe(1);
    expect(runs[0]?.status).toBe('COMPLETED');
    expect(runs[0]?.actionLogs).toContainEqual(expect.objectContaining({ action: 'add_tag', success: true }));
  });

  it('Execution loop guard -> stops at MAX_WORKFLOW_DEPTH boundary', async () => {
    if (!infra) return;

    // Depth >= MAX_WORKFLOW_DEPTH (10) should abort execution
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        firstName: 'Loop',
        lastName: 'Guard',
        source: 'MANUAL',
        status: 'NEW',
        createdById: ownerId
      }
    });

    const job = {
      id: `loop-evt-${Date.now()}`,
      data: {
        event: 'LEAD_CREATED',
        payload: {
          id: lead.id,
          organizationId: orgId,
          depth: MAX_WORKFLOW_DEPTH // exactly at limit — should abort
        }
      }
    } as Parameters<typeof processWorkflowExecutionJob>[0];

    await processWorkflowExecutionJob(job);

    // No runs should be recorded since it was aborted by loop guard
    const runsCount = await prisma.workflowRun.count({
      where: { depth: MAX_WORKFLOW_DEPTH }
    });
    expect(runsCount).toBe(0);
  });
});
