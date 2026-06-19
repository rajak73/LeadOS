// CRM-2.4 + CRM-3.2 — Lead routes.
//
// Permission model (execution plan §E2 CRM-2.4 / §E3 CRM-3.3):
//   POST   /leads               → leads.create
//   GET    /leads/:id           → leads.read  OR  leads.read_own  (ownOnly → 404 if not assigned)
//   PATCH  /leads/:id           → leads.update OR leads.update_own
//   DELETE /leads/:id           → leads.delete
//   POST   /leads/:id/convert   → leads.update (atomic lead→contact; sets status=WON)

import { Router } from 'express';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validate } from '../../core/middleware/validate.js';
import { createLeadSchema, patchLeadSchema, leadIdParamSchema, paginationQuerySchema } from '@leados/shared';
import type { LeadController } from './lead.controller.js';

export function buildLeadRouter(
  controller: LeadController,
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();

  router.post(
    '/',
    requirePermission('leads.create'),
    validate(createLeadSchema),
    asyncHandler(controller.create),
  );

  router.get(
    '/:id',
    requirePermission('leads.read'),
    validate(leadIdParamSchema, 'params'),
    asyncHandler(controller.getById),
  );

  router.patch(
    '/:id',
    requirePermission('leads.update'),
    validate(leadIdParamSchema, 'params'),
    validate(patchLeadSchema),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    requirePermission('leads.delete'),
    validate(leadIdParamSchema, 'params'),
    asyncHandler(controller.softDelete),
  );

  // CRM-3.2: atomic lead→contact conversion. Uses leads.update permission (resolves _own).
  // No request body — all data comes from the lead row. Responds 201 { lead, contact }.
  router.post(
    '/:id/convert',
    requirePermission('leads.update'),
    validate(leadIdParamSchema, 'params'),
    asyncHandler(controller.convert),
  );

  // CRM-4.1: paginated activity feed for a lead.
  router.get(
    '/:id/activities',
    requirePermission('leads.read'),
    validate(leadIdParamSchema, 'params'),
    validate(paginationQuerySchema, 'query'),
    asyncHandler(controller.listActivities),
  );

  return router;
}
