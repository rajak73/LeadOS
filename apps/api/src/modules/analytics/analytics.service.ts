import { withReplicaTenant } from '../../core/db/replica-client.js';
import { AnalyticsRepository } from './analytics.repository.js';
import { cacheRedis } from '../../core/redis/client.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { logger } from '../../core/observability/logger.js';

export class AnalyticsService {
  async getDashboardSummary(): Promise<unknown> {
    const ctx = requireTenantContext();
    const organizationId = ctx.organizationId;

    const cacheKey = `analytics:dashboard:${organizationId}`;
    try {
      const cached = await cacheRedis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err: unknown) {
      logger.warn({ message: 'Failed to fetch analytics from cache', error: err instanceof Error ? err.message : String(err) });
    }

    const data = await withReplicaTenant(organizationId, async (db) => {
      const repo = new AnalyticsRepository(db);

      const statusCounts = await repo.getCountsByStatus();
      const sourceCounts = await repo.getCountsBySource();
      const dealsSummary = await repo.getDealsSummary();
      const timeSeries = await repo.getLeadsTimeSeries();

      // Format status counts cleanly
      const statusMap: Record<string, number> = {
        NEW: 0,
        CONTACTED: 0,
        QUALIFIED: 0,
        LOST: 0,
        WON: 0,
      };
      let totalLeads = 0;
      for (const item of statusCounts) {
        statusMap[item.status] = item._count.id;
        totalLeads += item._count.id;
      }

      // Format source counts cleanly
      const sources = sourceCounts.map((item) => ({
        source: item.source,
        count: item._count.id,
      }));

      return {
        totalLeads,
        statusBreakdown: statusMap,
        sourceBreakdown: sources,
        deals: dealsSummary,
        leadsGrowth: timeSeries,
        computedAt: new Date().toISOString(),
      };
    });

    try {
      await cacheRedis.set(cacheKey, JSON.stringify(data), 'EX', 300); // 5 mins TTL
    } catch (err: unknown) {
      logger.warn({ message: 'Failed to write analytics to cache', error: err instanceof Error ? err.message : String(err) });
    }

    return data;
  }
}
