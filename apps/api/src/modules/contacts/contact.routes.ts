// CRM-3.3 + CRM-4.1 — Contact routes.
// CRM-5.1 — Notes sub-resource.
// CRM-5.2 — Files sub-resource.
//
// Permission model:
//   POST   /contacts                → contacts.create
//   GET    /contacts/:id            → contacts.read  OR  contacts.read_own  (ownOnly → 404 if not assigned)
//   PATCH  /contacts/:id            → contacts.update OR contacts.update_own
//   DELETE /contacts/:id            → contacts.delete
//   GET    /contacts/:id/activities → contacts.read OR contacts.read_own (paginated activity feed)
//   GET    /contacts/:id/notes      → contacts.read OR contacts.read_own (paginated notes)
//   GET    /contacts/:id/files      → contacts.read OR contacts.read_own (paginated files)

import { Router } from 'express';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validate } from '../../core/middleware/validate.js';
import {
  createContactSchema,
  patchContactSchema,
  contactIdParamSchema,
  paginationQuerySchema,
} from '@leados/shared';
import type { ContactController } from './contact.controller.js';

export function buildContactRouter(
  controller: ContactController,
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();

  router.post(
    '/',
    requirePermission('contacts.create'),
    validate(createContactSchema),
    asyncHandler(controller.create),
  );

  router.get(
    '/:id',
    requirePermission('contacts.read'),
    validate(contactIdParamSchema, 'params'),
    asyncHandler(controller.getById),
  );

  router.patch(
    '/:id',
    requirePermission('contacts.update'),
    validate(contactIdParamSchema, 'params'),
    validate(patchContactSchema),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    requirePermission('contacts.delete'),
    validate(contactIdParamSchema, 'params'),
    asyncHandler(controller.softDelete),
  );

  // CRM-4.1: paginated activity feed for a contact.
  router.get(
    '/:id/activities',
    requirePermission('contacts.read'),
    validate(contactIdParamSchema, 'params'),
    validate(paginationQuerySchema, 'query'),
    asyncHandler(controller.listActivities),
  );

  // CRM-5.1: paginated notes for a contact.
  router.get(
    '/:id/notes',
    requirePermission('contacts.read'),
    validate(contactIdParamSchema, 'params'),
    validate(paginationQuerySchema, 'query'),
    asyncHandler(controller.listNotes),
  );

  // CRM-5.2: paginated files for a contact.
  router.get(
    '/:id/files',
    requirePermission('contacts.read'),
    validate(contactIdParamSchema, 'params'),
    validate(paginationQuerySchema, 'query'),
    asyncHandler(controller.listFiles),
  );

  return router;
}
