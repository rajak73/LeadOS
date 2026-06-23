import { type ReplicaTenantTransactionClient } from '../../core/db/replica-client.js';

export class AnalyticsRepository {
  constructor(private readonly db: ReplicaTenantTransactionClient) {}

  async getCountsByStatus() {
    return this.db.lead.groupBy({
      by: ['status'],
      _count: { id: true },
    });
  }

  async getCountsBySource() {
    return this.db.lead.groupBy({
      by: ['source'],
      _count: { id: true },
    });
  }

  async getDealsSummary() {
    const summary = await this.db.deal.aggregate({
      _count: { id: true },
      _sum: { value: true },
    });
    return {
      count: summary._count.id,
      totalValue: summary._sum.value ? Number(summary._sum.value) : 0,
    };
  }

  async getLeadsTimeSeries() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const leads = await this.db.lead.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        deletedAt: null,
      },
      select: { createdAt: true },
    });

    const counts: Record<string, number> = {};
    for (const lead of leads) {
      const dateStr = lead.createdAt.toISOString().split('T')[0]!;
      counts[dateStr] = (counts[dateStr] || 0) + 1;
    }

    return Object.entries(counts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
