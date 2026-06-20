// CRM-5.1 — Note routes.
//
// Permission model:
//   POST   /notes        → notes.create
//   PATCH  /notes/:id    → notes.update
//   DELETE /notes/:id    → notes.delete
//
// Read paths (GET /leads/:id/notes, GET /contacts/:id/notes) live in the lead and
// contact routers, gated by leads.read / contacts.read respectively.

import { Router } from 'express';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validate } from '../../core/middleware/validate.js';
import { createNoteSchema, patchNoteSchema, noteIdParamSchema } from '@leados/shared';
import type { NoteController } from './note.controller.js';

export function buildNoteRouter(
  controller: NoteController,
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();

  router.post(
    '/',
    requirePermission('notes.create'),
    validate(createNoteSchema),
    asyncHandler(controller.create),
  );

  router.patch(
    '/:id',
    requirePermission('notes.update'),
    validate(noteIdParamSchema, 'params'),
    validate(patchNoteSchema),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    requirePermission('notes.delete'),
    validate(noteIdParamSchema, 'params'),
    asyncHandler(controller.softDelete),
  );

  return router;
}
