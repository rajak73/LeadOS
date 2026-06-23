import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';

export class SearchService {
  async search(query: string): Promise<unknown> {
    const ctx = requireTenantContext();
    const q = query.trim();
    if (!q) {
      return { leads: [], contacts: [], deals: [], conversations: [] };
    }

    const hasPermission = (permission: string) => {
      if (ctx.isSuperAdmin) return true;
      return ctx.permissions?.includes(permission) ?? false;
    };

    return withTenant(ctx.organizationId, async (db) => {
      const results = {
        leads: [] as import('@prisma/client').Lead[],
        contacts: [] as import('@prisma/client').Contact[],
        deals: [] as import('@prisma/client').Deal[],
        conversations: [] as unknown[],
      };

      // 1. Search Leads
      if (hasPermission('leads.read') || hasPermission('leads.read_own')) {
        const ownOnly = ctx.ownOnly === true && !hasPermission('leads.read');
        results.leads = await db.lead.findMany({
          where: {
            deletedAt: null,
            ...(ownOnly ? { assignedToId: ctx.userId } : {}),
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 10,
        });
      }

      // 2. Search Contacts
      if (hasPermission('contacts.read') || hasPermission('contacts.read_own')) {
        const ownOnly = ctx.ownOnly === true && !hasPermission('contacts.read');
        results.contacts = await db.contact.findMany({
          where: {
            deletedAt: null,
            ...(ownOnly ? { assignedToId: ctx.userId } : {}),
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 10,
        });
      }

      // 3. Search Deals
      if (hasPermission('deals.read') || hasPermission('deals.read_own')) {
        const ownOnly = ctx.ownOnly === true && !hasPermission('deals.read');
        results.deals = await db.deal.findMany({
          where: {
            deletedAt: null,
            ...(ownOnly ? { assignedToId: ctx.userId } : {}),
            title: { contains: q, mode: 'insensitive' },
          },
          take: 10,
        });
      }

      // 4. Search Conversations
      if (hasPermission('inbox.read') || hasPermission('inbox.read_own')) {
        const ownOnly = ctx.ownOnly === true && !hasPermission('inbox.read');
        results.conversations = await db.instagramConversation.findMany({
          where: {
            ...(ownOnly ? { assignedToId: ctx.userId } : {}),
            OR: [
              { igAccount: { igUsername: { contains: q, mode: 'insensitive' } } },
              { lead: { OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
              ] } },
            ]
          },
          include: {
            igAccount: { select: { id: true, igUsername: true } },
            lead: { select: { id: true, firstName: true, lastName: true } },
          },
          take: 10,
        });
      }

      return results;
    });
  }
}
