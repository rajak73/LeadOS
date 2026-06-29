import { Router } from 'express';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../../core/http/async-handler.js';
import { OrganizationController } from './organization.controller.js';
import { OrganizationService } from './organization.service.js';
import { OrganizationRepository } from './organization.repository.js';

export function buildOrganizationAdminRoutes(): Router {
  const router = Router();
  const repository = new OrganizationRepository();
  const service = new OrganizationService(repository);
  const controller = new OrganizationController(service);

  router.get('/', asyncHandler(controller.listOrganizations.bind(controller)));
  router.put('/:id/suspend', asyncHandler(controller.suspendOrganization.bind(controller)));
  router.delete('/:id', asyncHandler(controller.deleteOrganization.bind(controller)));
  router.get('/:id/usage', asyncHandler(controller.getOrganizationUsage.bind(controller)));

  return router;
}

export function buildOrganizationTenantRoutes(requirePermission?: (permission: string) => RequestHandler): Router {
  const router = Router();
  const repository = new OrganizationRepository();
  const service = new OrganizationService(repository);
  const controller = new OrganizationController(service);

  if (requirePermission) {
    router.get('/', requirePermission('org.read'), asyncHandler(controller.getOwnOrganization.bind(controller)));
    router.post('/', asyncHandler(controller.createOrganization.bind(controller))); // creating org doesn't need tenant permission since it's a new org, but needs auth
    router.put('/', requirePermission('org.update'), asyncHandler(controller.updateOrganization.bind(controller)));
    router.delete('/', requirePermission('org.delete'), asyncHandler(controller.deleteOwnOrganization.bind(controller)));
  } else {
    router.get('/', asyncHandler(controller.getOwnOrganization.bind(controller)));
    router.post('/', asyncHandler(controller.createOrganization.bind(controller)));
    router.put('/', asyncHandler(controller.updateOrganization.bind(controller)));
    router.delete('/', asyncHandler(controller.deleteOwnOrganization.bind(controller)));
  }

  return router;
}
