import { prisma } from '../../core/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';


export class CustomerService {
  /**
   * Aggregates Lead and Contact models into a unified list.
   * This retrieves contacts and unconverted leads, merging them into a generic Customer representation.
   */
  async listCustomers(orgId: string, search?: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    // Search contacts
    const contactWhere = {
      organizationId: orgId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search, mode: 'insensitive' as const } },
              { company: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    // Search unconverted leads
    const leadWhere = {
      organizationId: orgId,
      deletedAt: null,
      convertedToContactId: null, // Only fetch leads that haven't become contacts yet
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [contacts, leads, contactCount, leadCount] = await Promise.all([
      prisma.contact.findMany({
        where: contactWhere,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.lead.findMany({
        where: leadWhere,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: { aiScores: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      prisma.contact.count({ where: contactWhere }),
      prisma.lead.count({ where: leadWhere }),
    ]);

    const items = [
      ...contacts.map((c) => ({
        id: c.id,
        type: 'CONTACT',
        name: `${c.firstName} ${c.lastName || ''}`.trim(),
        email: c.email,
        phone: c.phone,
        company: c.company,
        avatarUrl: c.avatarUrl,
        updatedAt: c.updatedAt,
        score: null, // Contacts don't have direct AiScore in this iteration
      })),
      ...leads.map((l) => ({
        id: l.id,
        type: 'LEAD',
        name: `${l.firstName} ${l.lastName || ''}`.trim(),
        email: l.email,
        phone: l.phone,
        company: null,
        avatarUrl: null,
        updatedAt: l.updatedAt,
        score: l.aiScores?.[0]?.score ?? l.aiScore,
      })),
    ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // Basic in-memory pagination for aggregated list (approximation since we take limit from both)
    const paginatedItems = items.slice(0, limit);

    return {
      data: paginatedItems,
      meta: {
        total: contactCount + leadCount,
        page,
        limit,
      },
    };
  }

  /**
   * Fetches the full 360 profile.
   * If the ID belongs to a Contact, it aggregates data from the Contact and its originating Lead.
   * If it belongs to a Lead, it returns Lead data (if not converted).
   */
  async getCustomerProfile(orgId: string, id: string) {
    // 1. Try fetching as Contact
    const contact = await prisma.contact.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        createdFromLead: {
          include: {
            aiScores: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    if (contact) {
      return this.aggregateContactProfile(orgId, contact);
    }

    // 2. Try fetching as Lead
    const lead = await prisma.lead.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        aiScores: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!lead) {
      throw AppError.notFound('Customer not found');
    }

    if (lead.convertedToContactId) {
      // If the lead was converted, ideally redirect to the contact, but we'll fetch the contact profile.
      const convertedContact = await prisma.contact.findFirst({
        where: { id: lead.convertedToContactId, organizationId: orgId },
        include: {
          createdFromLead: {
            include: { aiScores: { orderBy: { createdAt: 'desc' }, take: 1 } },
          },
        },
      });
      if (convertedContact) {
        return this.aggregateContactProfile(orgId, convertedContact);
      }
    }

    return this.aggregateLeadProfile(orgId, lead);
  }

  private async aggregateContactProfile(orgId: string, contact: Record<string, unknown>) {
    const leadId = (contact.createdFromLead as Record<string, unknown> | undefined)?.id as string | undefined;
    
    // Aggregate activities, deals, notes, tasks, files, and conversations
    const [activities, deals, notes, tasks, igConversations, waConversations] = await Promise.all([
      prisma.activity.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { relatedContactId: contact.id as string },
            ...(leadId ? [{ relatedLeadId: leadId as string }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.deal.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          OR: [
            { contactId: contact.id as string },
            ...(leadId ? [{ leadId: leadId as string }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.note.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          OR: [
            { relatedContactId: contact.id as string },
            ...(leadId ? [{ relatedLeadId: leadId as string }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.task.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          OR: [
            { relatedContactId: contact.id as string },
            ...(leadId ? [{ relatedLeadId: leadId as string }] : []),
          ],
        },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.instagramConversation.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { contactId: contact.id as string },
            ...(leadId ? [{ leadId: leadId as string }] : []),
          ],
        },
        include: { messages: { orderBy: { sentAt: 'desc' }, take: 5 } }
      }),
      prisma.whatsAppConversation.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { contactId: contact.id as string },
            ...(leadId ? [{ leadId: leadId as string }] : []),
          ],
        },
        include: { waMessages: { orderBy: { sentAt: 'desc' }, take: 5 } }
      })
    ]);

    return {
      id: contact.id as string,
      type: 'CONTACT',
      profile: contact,
      originLead: contact.createdFromLead,
      engagementScore: (contact.createdFromLead as { aiScores?: unknown[] } | undefined)?.aiScores?.[0] ?? null,
      timeline: activities,
      deals,
      notes,
      tasks,
      communications: {
        instagram: igConversations,
        whatsapp: waConversations.map((wa: Record<string, unknown>) => ({ ...wa, messages: wa.waMessages })),
      },
    };
  }

  private async aggregateLeadProfile(orgId: string, lead: Record<string, unknown>) {
    const [activities, deals, notes, tasks, igConversations, waConversations] = await Promise.all([
      prisma.activity.findMany({
        where: { organizationId: orgId, relatedLeadId: lead.id as string },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.deal.findMany({
        where: { organizationId: orgId, leadId: lead.id as string, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.note.findMany({
        where: { organizationId: orgId, relatedLeadId: lead.id as string, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.task.findMany({
        where: { organizationId: orgId, relatedLeadId: lead.id as string, deletedAt: null },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.instagramConversation.findMany({
        where: { organizationId: orgId, leadId: lead.id as string },
        include: { messages: { orderBy: { sentAt: 'desc' }, take: 5 } }
      }),
      prisma.whatsAppConversation.findMany({
        where: { organizationId: orgId, leadId: lead.id as string },
        include: { waMessages: { orderBy: { sentAt: 'desc' }, take: 5 } }
      })
    ]);

    return {
      id: lead.id as string,
      type: 'LEAD',
      profile: lead,
      engagementScore: (lead as { aiScores?: unknown[] }).aiScores?.[0] ?? null,
      timeline: activities,
      deals,
      notes,
      tasks,
      communications: {
        instagram: igConversations,
        whatsapp: waConversations.map((wa: Record<string, unknown>) => ({ ...wa, messages: wa.waMessages })),
      },
    };
  }
}
