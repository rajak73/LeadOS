import { type Job } from 'bullmq';
import { withTenant, type TenantTransactionClient } from '../../../core/tenancy/with-tenant.js';
import { getTenantContext, runWithTenantContext } from '../../../core/tenancy/context.js';
import { PrismaWorkflowRepository } from '../../../modules/workflow/workflow.repository.js';
import { evaluateCondition } from '../../../modules/workflow/workflow.evaluator.js';
import { executeAction, MAX_WORKFLOW_DEPTH } from '../../../modules/workflow/workflow.actions.js';
import { cacheRedis } from '../../../core/redis/client.js';
import { logger } from '../../../core/observability/logger.js';
import { notifyOrg } from '../../../core/realtime/notification-publisher.js';
import { type WorkflowDefinition } from '@leados/shared';
import crypto from 'crypto';
import { type Prisma } from '@prisma/client';
import { enqueue } from '../queues.js';
import { QUEUE } from '../names.js';

export const WORKFLOW_EXECUTION_JOB = 'workflow-execution-job';

export async function processWorkflowExecutionJob(job: Job): Promise<void> {
  const { event, payload } = job.data as {
    event: string;
    payload: { organizationId: string; id: string; depth?: number; eventId?: string; resumeFromIndex?: number; runId?: string; workflowId?: string; [key: string]: unknown };
  };
  if (!event || !payload || !payload.organizationId) {
    logger.warn({ message: 'Invalid workflow execution job payload', jobId: job.id });
    return;
  }

  const organizationId = payload.organizationId;
  const entityId = payload.id;
  const depth = payload.depth || 0;
  const eventId = payload.eventId || job.id || crypto.randomUUID();

  // 1. Loop Guard — prevents infinite execution chains (e.g. LEAD_UPDATED triggers LEAD_UPDATED)
  if (depth >= MAX_WORKFLOW_DEPTH) {
    logger.warn({ message: 'Workflow depth limit exceeded, loop guard triggered', organizationId, entityId, depth, maxDepth: MAX_WORKFLOW_DEPTH });
    return;
  }

  await withTenant(organizationId, async (db) => {
    // 2. Fetch the entity
    let entity: { id: string; firstName?: string; assignedToId?: string | null; customFields?: unknown; deletedAt?: Date | null; [key: string]: unknown } | null = null;
    if (event.startsWith('LEAD_')) {
      entity = await db.lead.findUnique({ where: { id: entityId } });
    } else if (event.startsWith('DEAL_')) {
      entity = await db.deal.findUnique({ where: { id: entityId } });
    } else if (event === 'MESSAGE_RECEIVED') {
      entity = await db.message.findUnique({ where: { id: entityId } });
    }

    if (!entity || entity.deletedAt) {
      logger.info({ message: 'Entity not found or deleted, skipping workflow execution', entityId, event });
      return;
    }

    const repo = new PrismaWorkflowRepository(db);

    const resumeFromIndex = payload.resumeFromIndex !== undefined ? Number(payload.resumeFromIndex) : undefined;
    const isResume = resumeFromIndex !== undefined && !isNaN(resumeFromIndex) && payload.runId && payload.workflowId;

    if (isResume) {
      const workflow = await repo.findById(String(payload.workflowId));
      if (!workflow) return;
      const run = await db.workflowRun.findUnique({ where: { id: String(payload.runId) } });
      if (!run) return;
      const definition = workflow.definition as unknown as WorkflowDefinition;

      // 3. Stop Condition: Abort if not PENDING
      if (run.status !== 'PENDING') {
        logger.info({ message: 'Workflow run is not PENDING, aborting resume', runId: run.id, status: run.status });
        return;
      }

      // 5 & 6. Stop Condition: Check if WON or LOST
      if (entity && 'status' in entity) {
        const status = String(entity.status);
        if (status === 'WON' || status === 'LOST') {
          await db.workflowRun.update({
            where: { id: run.id },
            data: { status: 'SKIPPED', error: `Stopped: Entity status is ${status}` }
          });
          logger.info({ message: 'Workflow stopped on resume (Status)', runId: run.id, status });
          return;
        }
      }

      // 4. Stop Condition: Replied
      if (entity && 'id' in entity && (event.startsWith('LEAD_') || event.startsWith('DEAL_'))) {
        let replied = false;
        const igConvo = await db.instagramConversation.findFirst({
          where: { leadId: entity.id, lastInboundAt: { gt: run.updatedAt } }
        });
        if (igConvo) replied = true;
        else {
          const waConvo = await db.whatsAppConversation.findFirst({
            where: { leadId: entity.id, lastInboundAt: { gt: run.updatedAt } }
          });
          if (waConvo) replied = true;
        }

        if (replied) {
          await db.workflowRun.update({
            where: { id: run.id },
            data: { status: 'SKIPPED', error: 'Stopped: Lead replied' }
          });
          logger.info({ message: 'Workflow stopped on resume (Replied)', runId: run.id });
          return;
        }
      }

      // 8. Re-evaluate condition
      const conditions = definition.conditions || [];
      let conditionsMatch = true;
      for (const cond of conditions) {
        if (!evaluateCondition(cond, entity)) {
          conditionsMatch = false;
          break;
        }
      }

      if (!conditionsMatch) {
        await db.workflowRun.update({
          where: { id: run.id },
          data: { status: 'SKIPPED', error: 'Stopped: Conditions no longer met' }
        });
        logger.info({ message: 'Workflow stopped on resume (Condition False)', runId: run.id });
        return;
      }

      await executeWorkflowActions(db, organizationId, entity, workflow, run, definition, resumeFromIndex);
      return;
    }

    const workflows = await repo.findActiveByTriggerType(event);

    for (const workflow of workflows) {
      // 4. Idempotency check: DB unique + Redis key
      const redisKey = `workflow:run:lock:${workflow.id}:${eventId}`;
      const locked = await cacheRedis.set(redisKey, '1', 'EX', 3600, 'NX');
      if (!locked) {
        logger.info({ message: 'Duplicate workflow run event detected, skipping', workflowId: workflow.id, eventId });
        continue;
      }

      // Check if a completed run for this workflow and eventId exists in DB
      const existingRun = await db.workflowRun.findFirst({
        where: {
          workflowId: workflow.id,
          triggerEvent: {
            path: ['eventId'],
            equals: eventId,
          },
        },
      });
      if (existingRun) {
        logger.info({ message: 'Workflow run already recorded in DB, skipping', workflowId: workflow.id, eventId });
        continue;
      }

      // 5. Create Run (RUNNING)
      const triggerEventData = {
        eventId,
        event,
        payload,
      };

      const run = await repo.createRun({
        workflowId: workflow.id,
        triggerEvent: triggerEventData as Prisma.InputJsonValue,
        status: 'RUNNING',
        depth,
        actionLogs: [],
      });

      try {
        // 6. Evaluate conditions
        const definition = workflow.definition as unknown as WorkflowDefinition;
        const conditions = definition.conditions || [];

        let conditionsMatch = true;
        for (const cond of conditions) {
          if (!evaluateCondition(cond, entity)) {
            conditionsMatch = false;
            break;
          }
        }

        if (!conditionsMatch) {
          await db.workflowRun.update({
            where: { id: run.id },
            data: { status: 'SKIPPED' },
          });
          continue;
        }

        // 7. Execute Actions
        await executeWorkflowActions(db, organizationId, entity, workflow, run, definition, 0);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error({ message: 'Error executing workflow', workflowId: workflow.id, error: errorMsg });
        await db.workflowRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            error: errorMsg,
          },
        });
      }
    }

    async function executeWorkflowActions(
      db: TenantTransactionClient,
      organizationId: string,
      entity: { id: string; firstName?: string; email?: string | null; assignedToId?: string | null; customFields?: unknown; [key: string]: unknown },
      workflow: { id: string },
      run: { id: string; actionLogs: unknown },
      definition: WorkflowDefinition,
      startIndex: number
    ) {
      const logs: Record<string, unknown>[] = (run.actionLogs as Record<string, unknown>[]) || [];
      let failed = false;
      let errorMsg = '';
      let suspended = false;
      let delayMs = 0;

      const currentCtx = getTenantContext() || {
        organizationId,
        userId: 'system',
        role: 'SYSTEM',
        isSuperAdmin: false,
      };

      await runWithTenantContext({ ...currentCtx, depth: depth + 1 }, async () => {
        for (let i = startIndex; i < definition.actions.length; i++) {
          const action = definition.actions[i];
          if (!action) continue;
          const res = await executeAction(db, organizationId, action, entity, 'system');
          logs.push({ action: action.type, ...res });
          
          if (!res.success) {
            failed = true;
            errorMsg = res.error || 'Action failed';
            break;
          }

          if (res.suspended) {
            suspended = true;
            delayMs = res.delayMs || 0;
            await enqueue(QUEUE.WORKFLOW_EXECUTION, WORKFLOW_EXECUTION_JOB, {
              event,
              payload: { ...payload, resumeFromIndex: i + 1, runId: run.id, workflowId: workflow.id }
            }, { delay: delayMs });
            break;
          }
        }
      });

      if (suspended) {
        await db.workflowRun.update({
          where: { id: run.id },
          data: {
            status: 'PENDING',
            actionLogs: logs as Prisma.InputJsonValue,
          },
        });
        return;
      }

      await db.workflowRun.update({
        where: { id: run.id },
        data: {
          status: failed ? 'FAILED' : 'COMPLETED',
          error: errorMsg || null,
          actionLogs: logs as Prisma.InputJsonValue,
        },
      });

      try {
        notifyOrg(organizationId, 'workflow_run', {
          runId: run.id,
          workflowId: workflow.id,
          status: failed ? 'FAILED' : 'COMPLETED',
        });
      } catch {
        // ignore realtime error
      }
    }
  });
}
