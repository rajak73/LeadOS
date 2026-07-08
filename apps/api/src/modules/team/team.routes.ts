import { Router } from 'express';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../../core/http/async-handler.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';
import { TeamRepository } from './team.repository.js';

export function buildTeamRoutes(requirePermission: (permission: string) => RequestHandler): Router {
  const router = Router();
  const repository = new TeamRepository();
  const service = new TeamService(repository);
  const controller = new TeamController(service);

  // Invite member
  router.post(
    '/invite',
    requirePermission('team.invite'),
    asyncHandler(controller.inviteMember.bind(controller))
  );

  // Update member role
  router.put(
    '/:userId/role',
    requirePermission('team.update_role'),
    asyncHandler(controller.updateRole.bind(controller))
  );

  // Remove member
  router.delete(
    '/:userId',
    requirePermission('team.remove'),
    asyncHandler(controller.removeMember.bind(controller))
  );

  return router;
}
