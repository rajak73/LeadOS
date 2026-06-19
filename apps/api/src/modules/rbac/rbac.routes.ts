// RBAC-2.3 routes — mounted under the authenticated /api/v1 chain (auth → tenant → rbac).
// Each route is permission-guarded by the real requirePermission (injected from composition).

import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../core/middleware/validate.js';
import { asyncHandler } from '../../core/http/async-handler.js';
import type { RbacController } from './rbac.controller.js';

const assignRoleSchema = z.object({ roleId: z.string().uuid() });

export function buildRbacRouter(
  controller: RbacController,
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();

  router.get('/roles', requirePermission('team.read'), asyncHandler(controller.listRoles));

  router.patch(
    '/members/:userId/role',
    requirePermission('team.update_role'),
    validate(assignRoleSchema),
    asyncHandler(controller.assignRole),
  );

  router.post(
    '/members/:userId/suspend',
    requirePermission('team.suspend'),
    asyncHandler(controller.suspendMember),
  );

  return router;
}
