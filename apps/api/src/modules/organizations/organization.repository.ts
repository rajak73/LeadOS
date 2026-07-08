/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { prisma } from '../../core/prisma/client.js';
import type { Prisma, Organization } from '@prisma/client';

import { ROLE_PERMISSIONS } from '@leados/shared';

export class OrganizationRepository {
  async listOrganizations(search?: string, page = 1, limit = 50) {
    const where: Prisma.OrganizationWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              members: true,
              leads: { where: { deletedAt: null } },
              contacts: { where: { deletedAt: null } },
              deals: { where: { deletedAt: null } },
              instagramConversations: true,
              whatsappConversations: true,
              messages: true,
              whatsappMessages: true,
              tasks: { where: { deletedAt: null } },
            },
          },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    const mappedItems = items.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt,
      status: org.status,
      counts: {
        members: org._count.members,
        leads: org._count.leads,
        customers: org._count.contacts,
        deals: org._count.deals,
        conversations: org._count.instagramConversations + org._count.whatsappConversations,
        messages: org._count.messages + org._count.whatsappMessages,
        tasks: org._count.tasks,
      },
    }));

    return { items: mappedItems, total };
  }

  async createOrganizationWithDefaults(name: string, ownerId: string, data: Partial<Organization>) {
    return prisma.$transaction(async (tx) => {
      // 1. Create Organization
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const org = await tx.organization.create({
        data: {
          name,
          slug,
          ...(data as any),
        },
      });

      // 2. Create Roles & Permissions
      const roleRecords = [];
      for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
        const role = await tx.role.create({
          data: {
            organizationId: org.id,
            name: roleName,
          },
        });
        roleRecords.push({ name: roleName, id: role.id });

        if (permissions.length > 0) {
          await tx.permission.createMany({
            data: permissions.map((p: any) => {
              const [resource, action] = p.split('.');
              return {
                roleId: role.id,
                resource,
                action: action || 'read',
              };
            }),
          });
        }
      }

      // 3. Add Owner
      const ownerRole = roleRecords.find(r => r.name === 'OWNER');
      if (ownerRole) {
        await tx.organizationMember.create({
          data: {
            organizationId: org.id,
            userId: ownerId,
            roleId: ownerRole.id,
            status: 'ACTIVE',
          },
        });
      }

      return org;
    });
  }

  async getOrganizationById(id: string) {
    return prisma.organization.findUnique({
      where: { id },
    });
  }

  async updateOrganization(id: string, data: Partial<Pick<Organization, 'name' | 'industry' | 'timezone' | 'currency' | 'language'>>) {
    return prisma.organization.update({
      where: { id },
      data: (data as any),
    });
  }

  async updateOrganizationStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'DELETED', deleteAt?: Date | null) {
    return prisma.organization.update({
      where: { id },
      data: {
        status,
        deletedAt: deleteAt || null,
      },
    });
  }

  async getUsage(id: string): Promise<Record<string, unknown>> {
    const [
      membersCount,
      leadsCount,
      dealsCount,
      tasksCount,
      conversationsCount,
      workflowsCount,
      org
    ] = await Promise.all([
      prisma.organizationMember.count({ where: { organizationId: id } }),
      prisma.lead.count({ where: { organizationId: id, deletedAt: null } }),
      prisma.deal.count({ where: { organizationId: id, deletedAt: null } }),
      prisma.task.count({ where: { organizationId: id, deletedAt: null } }),
      prisma.instagramConversation.count({ where: { organizationId: id } }),
      prisma.workflow.count({ where: { organizationId: id } }),
      prisma.organization.findUnique({ where: { id }, select: { name: true, status: true, createdAt: true, updatedAt: true } })
    ]);

    return {
      organizationName: org?.name,
      organizationStatus: org?.status,
      memberCount: membersCount,
      leadCount: leadsCount,
      dealCount: dealsCount,
      taskCount: tasksCount,
      conversationCount: conversationsCount,
      workflowCount: workflowsCount,
      createdDate: org?.createdAt,
      lastActiveDate: org?.updatedAt, // Using updatedAt as a proxy for last active
    };
  }
}
