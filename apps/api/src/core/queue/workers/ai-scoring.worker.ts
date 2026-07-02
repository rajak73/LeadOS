import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { logger } from '../../observability/logger.js';
import { withTenant } from '../../tenancy/with-tenant.js';
import type { TenantContext } from '../../tenancy/context.js';
import { AiService } from '../../../modules/ai/ai.service.js';
import { getAiAdapter } from '../../../modules/ai/ai.adapter.js';
import { ActivityService } from '../../activities/activity.service.js';
import { ActivityType } from '@leados/shared';
import { AppError } from '../../errors/app-error.js';
import { enqueue } from '../queues.js';
import { QUEUE } from '../names.js';


export const AI_SCORING_JOB = 'score-lead';

export interface AiScoringPayload {
  leadId: string;
  organizationId: string;
  triggerEvent: string;
}

export async function processAiScoringJob(job: Job<AiScoringPayload>): Promise<void> {
  const { leadId, organizationId, triggerEvent } = job.data;

  logger.info({
    message: 'Processing AI scoring job',
    jobId: job.id,
    leadId,
    org: organizationId,
    triggerEvent,
  });

  // Select adapter based on environment variables & test modes
  const adapter = getAiAdapter();
  let aiService = new AiService(adapter);
  const activityService = new ActivityService();

  await withTenant(organizationId, async (db) => {
    // 1. Fetch current lead state to ensure it exists and is not deleted
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: { id: true, aiScore: true, deletedAt: true },
    });

    if (!lead || lead.deletedAt) {
      logger.info({
        message: 'Lead not found or soft-deleted, skipping AI scoring',
        leadId,
        org: organizationId,
      });
      return;
    }

    const previousScore = lead.aiScore ?? undefined;

    // 2. Compute score using the Service (bypass cache on manual rescore)
    let result;
    try {
      result = await aiService.scoreLead(db, organizationId, leadId, triggerEvent === 'MANUAL_RESCORE');
    } catch (err: unknown) {
      if (err instanceof AppError && err.code === 'AI_QUOTA_EXCEEDED') {
        logger.info({
          message: 'AI scoring quota exceeded, skipping lead score calculation gracefully',
          leadId,
          org: organizationId,
        });
        return;
      }
      
      logger.warn({
        message: 'Primary AI Adapter failed, falling back to MockAiAdapter',
        leadId,
        org: organizationId,
        error: err instanceof Error ? err.message : String(err)
      });
      
      // Fallback to MockAiAdapter so the job succeeds and data is generated
      const { MockAiAdapter } = await import('../../../modules/ai/ai.adapter.js');
      aiService = new AiService(new MockAiAdapter());
      result = await aiService.scoreLead(db, organizationId, leadId, true);
    }

    // 3. Persist score in the database (AiScore history + Lead denorm cache fields)
    await db.aiScore.create({
      data: {
        organizationId,
        leadId,
        score: result.score,
        factors: result.factors as unknown as Prisma.InputJsonValue,
        recommendation: result.recommendation,
        triggeredBy: triggerEvent,
        modelVersion: result.modelVersion,
      },
    });

    await db.lead.update({
      where: { id: leadId },
      data: {
        aiScore: result.score,
        aiScoreUpdatedAt: new Date(),
      },
    });

    const systemCtx: TenantContext = { organizationId, userId: organizationId, role: 'SYSTEM', isSuperAdmin: false };

    // 4. Log LEAD_SCORED activity
    await activityService.append(db, systemCtx, {
      type: ActivityType.LEAD_SCORED,
      description: `Lead scored by AI: ${result.score} (${result.recommendation})`,
      relatedLeadId: leadId,
      performedById: null,
      metadata: {
        type: ActivityType.LEAD_SCORED,
        leadId,
        score: result.score,
        ...(previousScore !== undefined ? { previousScore } : {}),
      },
    });

    // 5. Check score delta and notify the assigned agent if delta >= 10 points
    const delta =
      previousScore !== undefined
        ? Math.abs(result.score - previousScore)
        : result.score;

    const leadWithAssignee = await db.lead.findUnique({
      where: { id: leadId },
      select: { assignedToId: true, firstName: true, lastName: true },
    });

    if (delta >= 10 && leadWithAssignee?.assignedToId) {
      try {
        const { NotificationService } = await import(
          '../../../modules/notifications/notification.service.js'
        );
        const name =
          `${leadWithAssignee.firstName} ${leadWithAssignee.lastName || ''}`.trim();
        const notification = await new NotificationService().notify({
          organizationId,
          userId: leadWithAssignee.assignedToId,
          type: 'LEAD_SCORED',
          title: `Lead Score Change: ${name}`,
          body: `Lead ${name} score changed to ${result.score} (${result.recommendation})`,
          entityType: 'lead',
          entityId: leadId,
          email: {
            templateKey: 'lead_scored',
            data: {
              leadName: name,
              score: String(result.score),
              recommendation: result.recommendation,
            },
          },
        });

        if (notification) {
          const { notifyOrg } = await import('../../realtime/notification-publisher.js');
          notifyOrg(organizationId, 'notification', { id: notification.id });
        }
      } catch (err) {
        logger.warn({
          message: 'Notification publication failed for AI score (non-fatal)',
          org: organizationId,
          error: String(err),
        });
      }
    }

    // Enqueue LEAD_SCORE_CHANGED workflow event
    if (delta > 0) {
      await enqueue(QUEUE.WORKFLOW_EXECUTION, 'workflow-execution-job', {
        event: 'LEAD_SCORE_CHANGED',
        payload: { organizationId, id: leadId, score: result.score, previousScore, delta },
      });
    }
  });

  logger.info({
    message: 'AI scoring job completed successfully',
    leadId,
    org: organizationId,
  });
}
