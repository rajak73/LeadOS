import { createHash } from 'node:crypto';
import type { LeadContext, ScoreResult, AiUsageStatus } from '@leados/shared';
import { ErrorCode, PLAN_LIMITS } from '@leados/shared';
import { AppError } from '../../core/errors/app-error.js';
import { cacheRedis } from '../../core/redis/client.js';
import { logger } from '../../core/observability/logger.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import type { AiAdapter } from './ai.adapter.js';

export class AiService {
  constructor(private readonly adapter: AiAdapter) {}

  /**
   * Scores a lead by checking caches, quotas, and limits, and then calling the LLM adapter.
   */
  async scoreLead(
    db: TenantTransactionClient,
    organizationId: string,
    leadId: string,
    bypassCache = false,
  ): Promise<ScoreResult> {
    // 1. Compile context from database
    const lead = await db.lead.findUnique({
      where: { id: leadId },
    });
    if (!lead) {
      throw AppError.notFound('Lead not found');
    }

    const activities = await db.activity.findMany({
      where: { relatedLeadId: leadId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const context: LeadContext = {
      lead: {
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        status: lead.status,
        tags: lead.tags,
        customFields: (lead.customFields as Record<string, unknown>) || {},
      },
      activities: activities.map((a) => ({
        type: a.type,
        description: a.description,
        createdAt: a.createdAt.toISOString(),
      })),
    };

    // 2. Resolve limits based on organization subscription plan
    const sub = await db.subscription.findUnique({
      where: { organizationId },
    });
    const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
    const monthlyLimit = PLAN_LIMITS[plan].aiCallsPerMonth;
    const hourlyLimit = PLAN_LIMITS[plan].aiCallsPerHour;

    const periodMonth = new Date().toISOString().slice(0, 7);

    // 3. Enforce monthly quota limits
    if (monthlyLimit !== Number.POSITIVE_INFINITY) {
      const counter = await db.aiUsageCounter.findUnique({
        where: { organizationId_periodMonth: { organizationId, periodMonth } },
      });
      if (counter && counter.callCount >= monthlyLimit) {
        throw new AppError(ErrorCode.AI_QUOTA_EXCEEDED, 'Monthly AI scoring quota exceeded');
      }
    }

    // 4. Enforce Redis sliding-window hourly burst limits
    if (hourlyLimit !== Number.POSITIVE_INFINITY) {
      const limitKey = `ai:rate_limit:hourly:${organizationId}`;
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      const pipeline = cacheRedis.pipeline();
      pipeline.zremrangebyscore(limitKey, 0, oneHourAgo);
      pipeline.zcard(limitKey);
      const results = await pipeline.exec();
      const count = (results?.[1]?.[1] as number) || 0;

      if (count >= hourlyLimit) {
        throw new AppError(ErrorCode.RATE_LIMITED, 'Hourly AI rate limit exceeded');
      }

      await cacheRedis.zadd(limitKey, now, now.toString());
      await cacheRedis.expire(limitKey, 3600);
    }

    // 5. Prompt Cache lookup
    const payloadForHash = {
      status: lead.status,
      tags: lead.tags,
      source: lead.source,
      email: lead.email,
      phone: lead.phone,
      customFields: lead.customFields,
      lastActivityAt: lead.lastActivityAt?.toISOString() || lead.createdAt.toISOString(),
    };
    const hash = createHash('sha256').update(JSON.stringify(payloadForHash)).digest('hex');
    const cacheKey = `ai:score_cache:${organizationId}:${leadId}`;

    if (!bypassCache) {
      const cached = await cacheRedis.hgetall(cacheKey);
      if (cached && cached.hash === hash && cached.score) {
        return JSON.parse(cached.score) as ScoreResult;
      }
    }

    // 6. Enforce Circuit Breaker
    const breakerOpenKey = 'ai:circuit_breaker:open';
    const isBreakerOpen = await cacheRedis.get(breakerOpenKey);
    if (isBreakerOpen) {
      throw new AppError(
        ErrorCode.AI_PROVIDER_UNAVAILABLE,
        'AI provider is temporarily unavailable (circuit breaker open)',
      );
    }

    // 7. Execute provider call using circuit breaker tracking
    let result: ScoreResult;
    const startTime = Date.now();
    try {
      result = await this.adapter.scoreLead(context);
      const duration = Date.now() - startTime;
      
      logger.info({
        message: 'AI Lead scored successfully',
        leadId,
        org: organizationId,
        provider: result.modelVersion,
        durationMs: duration,
        score: result.score
      });
      
      await cacheRedis.del('ai:circuit_breaker:failures');
    } catch (err) {
      const failuresKey = 'ai:circuit_breaker:failures';
      const failures = await cacheRedis.incr(failuresKey);
      
      logger.error({
        message: 'AI provider call failed',
        leadId,
        org: organizationId,
        durationMs: Date.now() - startTime,
        failureCount: failures,
        error: err instanceof Error ? err.message : String(err)
      });
      
      if (failures >= 5) {
        await cacheRedis.set(breakerOpenKey, 'true', 'EX', 300); // open breaker for 5 mins
        await cacheRedis.del(failuresKey);
      }
      throw err;
    }

    // 8. Update Redis Prompt Cache
    await cacheRedis.hset(cacheKey, {
      hash,
      score: JSON.stringify(result),
    });
    await cacheRedis.expire(cacheKey, 86400); // 24 hours TTL

    // 9. Increment monthly counter
    await db.aiUsageCounter.upsert({
      where: { organizationId_periodMonth: { organizationId, periodMonth } },
      create: { organizationId, periodMonth, callCount: 1, tokenCount: 0 },
      update: { callCount: { increment: 1 } },
    });

    return result;
  }

  /**
   * Retrieves organization monthly AI usage status.
   */
  async getUsageStatus(db: TenantTransactionClient, organizationId: string): Promise<AiUsageStatus> {
    const sub = await db.subscription.findUnique({
      where: { organizationId },
    });
    const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
    const limit = PLAN_LIMITS[plan].aiCallsPerMonth;

    const periodMonth = new Date().toISOString().slice(0, 7);
    const counter = await db.aiUsageCounter.findUnique({
      where: { organizationId_periodMonth: { organizationId, periodMonth } },
    });

    const callCount = counter?.callCount ?? 0;
    const tokenCount = counter?.tokenCount ?? 0;

    return {
      periodMonth,
      callCount,
      tokenCount,
      quotaLimit: limit,
      isOverQuota: limit !== Number.POSITIVE_INFINITY && callCount >= limit,
    };
  }

  /**
   * Generates a follow-up draft suggestion using the AI provider.
   */
  async draftFollowup(
    db: TenantTransactionClient,
    organizationId: string,
    leadId: string,
  ): Promise<{ channel: 'EMAIL' | 'INSTAGRAM_DM'; draft: string }> {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
    });
    if (!lead) {
      throw AppError.notFound('Lead not found');
    }

    const activities = await db.activity.findMany({
      where: { relatedLeadId: leadId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const context: LeadContext = {
      lead: {
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        status: lead.status,
        tags: lead.tags,
        customFields: (lead.customFields as Record<string, unknown>) || {},
      },
      activities: activities.map((a) => ({
        type: a.type,
        description: a.description,
        createdAt: a.createdAt.toISOString(),
      })),
    };

    const sub = await db.subscription.findUnique({
      where: { organizationId },
    });
    const plan = (sub?.plan ?? 'TRIAL') as keyof typeof PLAN_LIMITS;
    const monthlyLimit = PLAN_LIMITS[plan].aiCallsPerMonth;
    const periodMonth = new Date().toISOString().slice(0, 7);

    if (monthlyLimit !== Number.POSITIVE_INFINITY) {
      const counter = await db.aiUsageCounter.findUnique({
        where: { organizationId_periodMonth: { organizationId, periodMonth } },
      });
      if (counter && counter.callCount >= monthlyLimit) {
        throw new AppError(ErrorCode.AI_QUOTA_EXCEEDED, 'Monthly AI quota exceeded');
      }
    }

    const result = await this.adapter.draftFollowup(context);

    await db.aiUsageCounter.upsert({
      where: { organizationId_periodMonth: { organizationId, periodMonth } },
      create: { organizationId, periodMonth, callCount: 1, tokenCount: 0 },
      update: { callCount: { increment: 1 } },
    });

    return result;
  }
}
