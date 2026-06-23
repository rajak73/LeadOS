import { type Job } from 'bullmq';
import { withTenant } from '../../../core/tenancy/with-tenant.js';
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

export const WORKFLOW_EXECUTION_JOB = 'workflow-execution-job';

export async function processWorkflowExecutionJob(job: Job): Promise<void> {
  const { event, payload } = job.data as {
    event: string;
    payload: { organizationId: string; id: string; depth?: number; eventId?: string; [key: string]: unknown };
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

    // 3. Find active workflows for this trigger type
    const repo = new PrismaWorkflowRepository(db);
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
        const logs: { action: string; success: boolean; error?: string; message?: string }[] = [];
        let failed = false;
        let errorMsg = '';

        // Run actions with propagated depth context
        const currentCtx = getTenantContext() || {
          organizationId,
          userId: 'system',
          role: 'SYSTEM',
          isSuperAdmin: false,
        };

        await runWithTenantContext({ ...currentCtx, depth: depth + 1 }, async () => {
          for (const action of definition.actions) {
            const res = await executeAction(db, organizationId, action, entity, 'system');
            logs.push({ action: action.type, ...res });
            if (!res.success) {
              failed = true;
              errorMsg = res.error || 'Action failed';
              break;
            }
          }
        });

        await db.workflowRun.update({
          where: { id: run.id },
          data: {
            status: failed ? 'FAILED' : 'COMPLETED',
            error: errorMsg || null,
            actionLogs: logs,
          },
        });

        // Emit realtime run update
        try {
          notifyOrg(organizationId, 'workflow_run', {
            runId: run.id,
            workflowId: workflow.id,
            status: failed ? 'FAILED' : 'COMPLETED',
          });
        } catch {
          // Ignore realtime errors in test/worker
        }
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
  });
}
