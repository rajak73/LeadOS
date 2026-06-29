import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';
import { isEnabled } from '../../core/flags/flags.js';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { AiService } from './ai.service.js';
import { getAiAdapter } from './ai.adapter.js';
import { enqueue } from '../../core/queue/queues.js';
import { QUEUE } from '../../core/queue/names.js';

export class AiController {
  constructor(private readonly service: AiService) {}

  getLeadScore = async (req: Request, res: Response): Promise<void> => {
    const ctx = requireTenantContext();
    const leadId = req.params['id']!;
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    const result = await withTenant(ctx.organizationId, async (db) => {
      // 1. Verify lead exists and belongs to organization
      const lead = await db.lead.findUnique({
        where: { id: leadId },
      });

      if (!lead || lead.deletedAt || (ownedByUserId && lead.assignedToId !== ownedByUserId)) {
        throw AppError.notFound('Lead not found');
      }

      // 2. Fetch latest AI score details
      const latestScore = await db.aiScore.findFirst({
        where: { leadId },
        orderBy: { createdAt: 'desc' },
      });

      // 3. Fetch full scoring history
      const history = await db.aiScore.findMany({
        where: { leadId },
        orderBy: { createdAt: 'desc' },
      });

      return {
        score: lead.aiScore,
        aiScoreUpdatedAt: lead.aiScoreUpdatedAt,
        factors: latestScore?.factors || null,
        recommendation: latestScore?.recommendation || null,
        history,
      };
    });

    sendSuccess(res, result);
  };

  rescoreLead = async (req: Request, res: Response): Promise<void> => {
    const ctx = requireTenantContext();
    const leadId = req.params['id']!;
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    // Check kill switch flag
    if (!isEnabled('ai.scoring.enabled')) {
      throw new AppError(ErrorCode.FEATURE_DISABLED, 'AI scoring is disabled');
    }

    await withTenant(ctx.organizationId, async (db) => {
      // 1. Verify lead exists
      const lead = await db.lead.findUnique({
        where: { id: leadId },
      });

      if (!lead || lead.deletedAt || (ownedByUserId && lead.assignedToId !== ownedByUserId)) {
        throw AppError.notFound('Lead not found');
      }

      // 2. Check plan usage quota limit
      const usage = await this.service.getUsageStatus(db, ctx.organizationId);
      if (usage.isOverQuota) {
        throw new AppError(ErrorCode.AI_QUOTA_EXCEEDED, 'Monthly AI scoring quota exceeded');
      }

      // 3. Enqueue rescore job to BullMQ
      await enqueue(QUEUE.AI_SCORING, 'score-lead', {
        leadId,
        organizationId: ctx.organizationId,
        triggerEvent: 'MANUAL_RESCORE',
      });
    });

    sendSuccess(res, { status: 'PENDING' }, 202);
  };

  getFollowUpSuggestion = async (req: Request, res: Response): Promise<void> => {
    const ctx = requireTenantContext();
    const leadId = req.params['id']!;
    const ownedByUserId = ctx.ownOnly === true ? ctx.userId : undefined;

    const result = await withTenant(ctx.organizationId, async (db) => {
      const lead = await db.lead.findUnique({
        where: { id: leadId },
      });

      if (!lead || lead.deletedAt || (ownedByUserId && lead.assignedToId !== ownedByUserId)) {
        throw AppError.notFound('Lead not found');
      }

      return this.service.draftFollowup(db, ctx.organizationId, leadId);
    });

    sendSuccess(res, result);
  };
}

export function createAiController(): AiController {
  const service = new AiService(getAiAdapter());
  return new AiController(service);
}
