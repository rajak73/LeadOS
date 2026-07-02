import { prisma } from '../../core/prisma/client.js';

export class TeamRepository {
  async getMember(organizationId: string, userId: string) {
    return prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { role: true }
    });
  }

  async getRoleByName(organizationId: string, roleName: string) {
    return prisma.role.findUnique({
      where: { organizationId_name: { organizationId, name: roleName } }
    });
  }

  async updateMemberRole(organizationId: string, userId: string, roleId: string) {
    return prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { roleId },
    });
  }

  async removeMember(organizationId: string, userId: string) {
    return prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId, userId } },
    });
  }
}
