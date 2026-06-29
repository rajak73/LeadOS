// CRM-2.4 + CRM-3.2 — Lead routes.
// CRM-4.1 — Activity feed.
// CRM-5.1 — Notes sub-resource.
// CRM-5.2 — Files sub-resource.
// CRM-6.3 — CSV import (BullMQ async).
// CRM-6.4 — CSV export (BullMQ async).
//
// Permission model (execution plan §E2 CRM-2.4 / §E3 CRM-3.3):
//   POST   /leads                   → leads.create
//   GET    /leads/:id               → leads.read  OR  leads.read_own  (ownOnly → 404 if not assigned)
//   PATCH  /leads/:id               → leads.update OR leads.update_own
//   DELETE /leads/:id               → leads.delete
//   POST   /leads/:id/convert       → leads.update (atomic lead→contact; sets status=WON)
//   GET    /leads/:id/activities    → leads.read  OR  leads.read_own (paginated activity feed)
//   GET    /leads/:id/notes         → leads.read  OR  leads.read_own (paginated notes)
//   GET    /leads/:id/files         → leads.read  OR  leads.read_own (paginated files)
//
// ROUTE ORDERING: /import and /export MUST be registered before /:id to prevent Express
// from matching the literal string "import" or "export" as a UUID id parameter.

import { Router } from 'express';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validate } from '../../core/middleware/validate.js';
import { createLeadSchema, patchLeadSchema, leadIdParamSchema, paginationQuerySchema, leadListQuerySchema, leadExportBodySchema, createLeadNoteBodySchema, bulkLeadsSchema } from '@leados/shared';
import type { LeadController } from './lead.controller.js';
import { buildAiRouter } from '../ai/ai.routes.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB

export function buildLeadRouter(
  controller: LeadController,
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();

  // Mount AI routes (/:id/score, /:id/rescore)
  router.use('/', buildAiRouter(requirePermission));

  // CRM-6.1: Lead list.
  router.get(
    '/',
    requirePermission('leads.read'),
    validate(leadListQuerySchema, 'query'),
    asyncHandler(controller.list),
  );

  router.post(
    '/',
    requirePermission('leads.create'),
    validate(createLeadSchema),
    asyncHandler(controller.create),
  );

  // CRM-6.3: CSV import — literal path must precede /:id.
  router.post(
    '/import',
    requirePermission('leads.create'),
    upload.single('file'),
    asyncHandler(controller.importCsv),
  );

  router.get(
    '/import/:jobId',
    requirePermission('leads.read'),
    asyncHandler(controller.getImportJob),
  );

  router.get(
    '/import-history',
    requirePermission('leads.read'),
    validate(paginationQuerySchema, 'query'),
    asyncHandler(controller.listImportHistory),
  );

  router.get(
    '/import-history/:id',
    requirePermission('leads.read'),
    asyncHandler(controller.getImportHistoryById),
  );

  // CRM-6.4: CSV export — literal path must precede /:id.
  router.post(
    '/export',
    requirePermission('leads.read'),
    validate(leadExportBodySchema),
    asyncHandler(controller.exportCsv),
  );

  router.get(
    '/export/:jobId',
    requirePermission('leads.read'),
    asyncHandler(controller.getExportJob),
  );

  router.post(
    '/bulk',
    requirePermission('leads.update'),
    validate(bulkLeadsSchema),
    asyncHandler(controller.bulk),
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

  // CRM-5.1: paginated notes for a lead.
  router.get(
    '/:id/notes',
    requirePermission('leads.read'),
    validate(leadIdParamSchema, 'params'),
    validate(paginationQuerySchema, 'query'),
    asyncHandler(controller.listNotes),
  );

  // CRM-5.1: create a note for a lead. Uses leads.update permission (resolves _own).
  // relatedLeadId comes from the URL param; body carries only the content JSON object.
  router.post(
    '/:id/notes',
    requirePermission('leads.update'),
    validate(leadIdParamSchema, 'params'),
    validate(createLeadNoteBodySchema),
    asyncHandler(controller.createNote),
  );

  // CRM-5.2: paginated files for a lead.
  router.get(
    '/:id/files',
    requirePermission('leads.read'),
    validate(leadIdParamSchema, 'params'),
    validate(paginationQuerySchema, 'query'),
    asyncHandler(controller.listFiles),
  );

  return router;
}
