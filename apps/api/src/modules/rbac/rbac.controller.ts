// RBAC-2.3 — thin controllers. The org comes from the tenant context (never from the client).

import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import type { RbacService } from './rbac.service.js';

export interface RbacController {
  listRoles(req: Request, res: Response): Promise<void>;
  assignRole(req: Request, res: Response): Promise<void>;
  suspendMember(req: Request, res: Response): Promise<void>;
}

export function createRbacController(service: RbacService): RbacController {
  return {
    async listRoles(_req, res) {
      const { organizationId } = requireTenantContext();
      sendSuccess(res, { roles: await service.listRoles(organizationId) });
    },

    async assignRole(req, res) {
      const { organizationId } = requireTenantContext();
      const userId = req.params.userId!;
      const { roleId } = req.body as { roleId: string };
      await service.assignRole(organizationId, userId, roleId);
      sendSuccess(res, { success: true });
    },

    async suspendMember(req, res) {
      const { organizationId } = requireTenantContext();
      const userId = req.params.userId!;
      await service.suspendMember(organizationId, userId);
      sendSuccess(res, { success: true });
    },
  };
}
