// CRM-8.3 — Pipeline routes.
//
// Route registration order is critical: /stages/reorder MUST be registered before
// /stages/:stageId, otherwise Express matches "reorder" as a stageId UUID param and
// the validate middleware rejects it with 422 before the handler runs.
//
// Permission model:
//   GET    /pipelines                        → pipelines.read
//   POST   /pipelines                        → pipelines.create
//   GET    /pipelines/:id                    → pipelines.read
//   PATCH  /pipelines/:id                    → pipelines.update
//   DELETE /pipelines/:id                    → pipelines.delete
//   POST   /pipelines/:id/stages             → pipelines.update
//   PATCH  /pipelines/:id/stages/reorder     → pipelines.update  ← before /:stageId
//   PATCH  /pipelines/:id/stages/:stageId    → pipelines.update
//   DELETE /pipelines/:id/stages/:stageId    → pipelines.update

import { Router } from 'express';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validate } from '../../core/middleware/validate.js';
import {
  createPipelineSchema,
  patchPipelineSchema,
  createStageSchema,
  patchStageSchema,
  reorderStagesSchema,
} from '@leados/shared';
import type { PipelineController } from './pipeline.controller.js';

const pipelineParamSchema = z.object({ id: z.string().uuid() });
const stageParamSchema = z.object({ id: z.string().uuid(), stageId: z.string().uuid() });

export function buildPipelineRouter(
  controller: PipelineController,
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('pipelines.read'),
    asyncHandler(controller.list),
  );

  router.post(
    '/',
    requirePermission('pipelines.create'),
    validate(createPipelineSchema),
    asyncHandler(controller.create),
  );

  router.get(
    '/:id',
    requirePermission('pipelines.read'),
    validate(pipelineParamSchema, 'params'),
    asyncHandler(controller.getById),
  );

  router.patch(
    '/:id',
    requirePermission('pipelines.update'),
    validate(pipelineParamSchema, 'params'),
    validate(patchPipelineSchema),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    requirePermission('pipelines.delete'),
    validate(pipelineParamSchema, 'params'),
    asyncHandler(controller.remove),
  );

  router.post(
    '/:id/stages',
    requirePermission('pipelines.update'),
    validate(pipelineParamSchema, 'params'),
    validate(createStageSchema),
    asyncHandler(controller.createStage),
  );

  // IMPORTANT: /stages/reorder registered BEFORE /stages/:stageId.
  router.patch(
    '/:id/stages/reorder',
    requirePermission('pipelines.update'),
    validate(pipelineParamSchema, 'params'),
    validate(reorderStagesSchema),
    asyncHandler(controller.reorderStages),
  );

  router.patch(
    '/:id/stages/:stageId',
    requirePermission('pipelines.update'),
    validate(stageParamSchema, 'params'),
    validate(patchStageSchema),
    asyncHandler(controller.updateStage),
  );

  router.delete(
    '/:id/stages/:stageId',
    requirePermission('pipelines.update'),
    validate(stageParamSchema, 'params'),
    asyncHandler(controller.deleteStage),
  );

  return router;
}
