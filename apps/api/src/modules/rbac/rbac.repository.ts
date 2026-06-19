// RBAC-2.3 data access — org-scoped role/member operations, all through withTenant (the org is
// known from the caller's tenant context, respecting D-M3-2).

import { withTenant } from '../../core/tenancy/with-tenant.js';

export interface RoleSummary {
  id: string;
  name: string;
  isSystem: boolean;
}

export interface RbacRepository {
  listRoles(organizationId: string): Promise<RoleSummary[]>;
  roleExists(organizationId: string, roleId: string): Promise<boolean>;
  assignRole(organizationId: string, userId: string, roleId: string): Promise<boolean>;
  suspendMember(organizationId: string, userId: string): Promise<boolean>;
}

export class PrismaRbacRepository implements RbacRepository {
  listRoles(organizationId: string): Promise<RoleSummary[]> {
    return withTenant(organizationId, (db) =>
      db.role.findMany({ select: { id: true, name: true, isSystem: true }, orderBy: { name: 'asc' } }),
    );
  }

  roleExists(organizationId: string, roleId: string): Promise<boolean> {
    return withTenant(organizationId, async (db) => {
      const role = await db.role.findFirst({ where: { id: roleId }, select: { id: true } });
      return role !== null;
    });
  }

  assignRole(organizationId: string, userId: string, roleId: string): Promise<boolean> {
    return withTenant(organizationId, async (db) => {
      const result = await db.organizationMember.updateMany({ where: { userId }, data: { roleId } });
      return result.count > 0;
    });
  }

  suspendMember(organizationId: string, userId: string): Promise<boolean> {
    return withTenant(organizationId, async (db) => {
      const result = await db.organizationMember.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'SUSPENDED' },
      });
      return result.count > 0;
    });
  }
}
