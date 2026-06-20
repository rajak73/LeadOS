// CRM-9.3 — Deal routes.
//
// Route ordering: /forecast must be registered before /:id.
//
// Permission model:
//   GET    /deals              → deals.read OR deals.read_own
//   POST   /deals              → deals.create
//   GET    /deals/forecast     → deals.read
//   GET    /deals/:id          → deals.read OR deals.read_own
//   PATCH  /deals/:id          → deals.update OR deals.update_own
//   DELETE /deals/:id          → deals.delete
//   POST   /deals/:id/move     → deals.update OR deals.update_own
//   POST   /deals/:id/won      → deals.update OR deals.update_own
//   POST   /deals/:id/lost     → deals.update OR deals.update_own

import { Router } from 'express';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validate } from '../../core/middleware/validate.js';
import {
  createDealSchema,
  dealListQuerySchema,
  lostDealSchema,
  moveDealSchema,
  patchDealSchema,
} from '@leados/shared';
import type { DealController } from './deal.controller.js';

const dealParamSchema = z.object({ id: z.string().uuid() });
const forecastQuerySchema = z.object({ pipelineId: z.string().uuid().optional() });
const activitiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function buildDealRouter(
  controller: DealController,
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();

  router.get(
    '/forecast',
    requirePermission('deals.read'),
    validate(forecastQuerySchema, 'query'),
    asyncHandler(controller.forecast),
  );

  router.get(
    '/',
    requirePermission('deals.read'),
    validate(dealListQuerySchema, 'query'),
    asyncHandler(controller.list),
  );

  router.post(
    '/',
    requirePermission('deals.create'),
    validate(createDealSchema),
    asyncHandler(controller.create),
  );

  router.get(
    '/:id',
    requirePermission('deals.read'),
    validate(dealParamSchema, 'params'),
    asyncHandler(controller.getById),
  );

  router.patch(
    '/:id',
    requirePermission('deals.update'),
    validate(dealParamSchema, 'params'),
    validate(patchDealSchema),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    requirePermission('deals.delete'),
    validate(dealParamSchema, 'params'),
    asyncHandler(controller.remove),
  );

  router.post(
    '/:id/move',
    requirePermission('deals.update'),
    validate(dealParamSchema, 'params'),
    validate(moveDealSchema),
    asyncHandler(controller.move),
  );

  router.post(
    '/:id/won',
    requirePermission('deals.update'),
    validate(dealParamSchema, 'params'),
    asyncHandler(controller.markWon),
  );

  router.post(
    '/:id/lost',
    requirePermission('deals.update'),
    validate(dealParamSchema, 'params'),
    validate(lostDealSchema),
    asyncHandler(controller.markLost),
  );

  // M5: activity feed for Deal Detail. Service method existed in M3; route deferred until M5.
  router.get(
    '/:id/activities',
    requirePermission('deals.read'),
    validate(dealParamSchema, 'params'),
    validate(activitiesQuerySchema, 'query'),
    asyncHandler(controller.listActivities),
  );

  return router;
}
