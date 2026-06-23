import { prisma } from '../../core/prisma/client.js';
import { withTenant, type TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { logger } from '../../core/observability/logger.js';

export class FollowupService {
  /**
   * Sweeps all active organizations and enqueues follow-up tasks for stale leads and overdue deals.
   */
  async sweepAllOrganizations(): Promise<void> {
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    logger.info({ message: `Starting follow-up sweep for ${orgs.length} organizations` });

    for (const org of orgs) {
      try {
        await withTenant(org.id, async (db) => {
          await this.sweepTenant(db, org.id);
        });
      } catch (err: unknown) {
        logger.error({
          message: `Failed to execute follow-up sweep for org ${org.name}`,
          orgId: org.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Run sweep for a specific tenant DB transaction.
   */
  async sweepTenant(db: TenantTransactionClient, organizationId: string): Promise<{ leadsCreated: number; dealsCreated: number }> {
    let leadsCreated = 0;
    let dealsCreated = 0;

    // 1. Process Stale Leads (NEW or CONTACTED status, unchanged/no activity for > 3 days)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const staleLeads = await db.lead.findMany({
      where: {
        status: { in: ['NEW', 'CONTACTED'] },
        deletedAt: null,
        OR: [
          { lastActivityAt: { lt: threeDaysAgo } },
          {
            AND: [
              { lastActivityAt: null },
              { createdAt: { lt: threeDaysAgo } },
            ],
          },
        ],
      },
    });

    for (const lead of staleLeads) {
      // Check for active follow-up tasks
      const activeTask = await db.task.findFirst({
        where: {
          relatedLeadId: lead.id,
          type: 'FOLLOW_UP',
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          deletedAt: null,
        },
      });

      if (!activeTask) {
        const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
        await db.task.create({
          data: {
            organizationId,
            title: `Follow up with lead: ${leadName}`,
            description: 'Automated follow-up task triggered due to lead inactivity (no updates for 3+ days).',
            type: 'FOLLOW_UP',
            priority: 'MEDIUM',
            status: 'PENDING',
            relatedLeadId: lead.id,
            assignedToId: lead.assignedToId ?? lead.createdById,
            createdById: lead.createdById,
          },
        });

        // Log FOLLOW_UP_CREATED activity
        await db.activity.create({
          data: {
            organizationId,
            type: 'FOLLOW_UP_CREATED',
            description: `Automated follow-up task created for stale lead: ${leadName}`,
            relatedLeadId: lead.id,
            metadata: { trigger: 'STALE_LEAD' },
          },
        });

        leadsCreated++;
      }
    }

    // 2. Process Overdue Deals (OPEN status, expectedCloseDate in the past)
    const overdueDeals = await db.deal.findMany({
      where: {
        status: 'OPEN',
        expectedCloseDate: { lt: new Date() },
        deletedAt: null,
      },
    });

    for (const deal of overdueDeals) {
      // Check for active follow-up tasks
      const activeTask = await db.task.findFirst({
        where: {
          relatedDealId: deal.id,
          type: 'FOLLOW_UP',
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          deletedAt: null,
        },
      });

      if (!activeTask) {
        await db.task.create({
          data: {
            organizationId,
            title: `Follow up on overdue deal: ${deal.title}`,
            description: `Automated follow-up task triggered because expected close date (${deal.expectedCloseDate?.toLocaleDateString()}) has passed.`,
            type: 'FOLLOW_UP',
            priority: 'HIGH',
            status: 'PENDING',
            relatedDealId: deal.id,
            relatedLeadId: deal.leadId,
            relatedContactId: deal.contactId,
            assignedToId: deal.assignedToId ?? deal.createdById,
            createdById: deal.createdById,
          },
        });

        // Log FOLLOW_UP_CREATED activity
        await db.activity.create({
          data: {
            organizationId,
            type: 'FOLLOW_UP_CREATED',
            description: `Automated follow-up task created for overdue deal: ${deal.title}`,
            relatedDealId: deal.id,
            relatedLeadId: deal.leadId,
            relatedContactId: deal.contactId,
            metadata: { trigger: 'OVERDUE_DEAL' },
          },
        });

        dealsCreated++;
      }
    }

    return { leadsCreated, dealsCreated };
  }
}
