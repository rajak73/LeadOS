// CRM-5.2 — File routes.
//
// Permission model:
//   POST   /files/presigned-url → files.create  (step 1: generate presigned PUT URL)
//   POST   /files               → files.create  (step 2: record metadata after upload)
//   DELETE /files/:id           → files.delete  (soft delete; physical deletion via S3 lifecycle)
//
// Read paths (GET /leads/:id/files, GET /contacts/:id/files) live in the lead and
// contact routers, gated by leads.read / contacts.read respectively.

import { Router } from 'express';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validate } from '../../core/middleware/validate.js';
import { presignedUrlRequestSchema, recordFileSchema, fileIdParamSchema } from '@leados/shared';
import type { FileController } from './file.controller.js';

export function buildFileRouter(
  controller: FileController,
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();

  router.post(
    '/presigned-url',
    requirePermission('files.create'),
    validate(presignedUrlRequestSchema),
    asyncHandler(controller.presignedUrl),
  );

  router.post(
    '/',
    requirePermission('files.create'),
    validate(recordFileSchema),
    asyncHandler(controller.recordMetadata),
  );

  router.delete(
    '/:id',
    requirePermission('files.delete'),
    validate(fileIdParamSchema, 'params'),
    asyncHandler(controller.softDelete),
  );

  return router;
}
