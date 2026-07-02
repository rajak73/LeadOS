import { Router } from 'express';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../../core/http/async-handler.js';
import { SearchService } from './search.service.js';
import { createSearchController } from './search.controller.js';

export function buildSearchRouter(
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();
  const service = new SearchService();
  const controller = createSearchController(service);

  router.get(
    '/',
    requirePermission('org.read'),
    asyncHandler(controller.search),
  );

  return router;
}

export function buildAdminSearchRouter(): Router {
  const router = Router();
  const service = new SearchService();
  const controller = createSearchController(service);

  router.get('/', asyncHandler(controller.adminSearch));

  return router;
}
