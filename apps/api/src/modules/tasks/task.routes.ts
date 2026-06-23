// CRM-4.4 — Task routes.
//
// Permission model:
//   POST   /tasks       → tasks.create
//   GET    /tasks/:id   → tasks.read
//   PATCH  /tasks/:id   → tasks.update  OR  tasks.update_own  (SALES_EXECUTIVE — ownOnly filters by assignedToId)
//   DELETE /tasks/:id   → tasks.delete

import { Router } from 'express';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validate } from '../../core/middleware/validate.js';
import { createTaskSchema, patchTaskSchema, taskIdParamSchema } from '@leados/shared';
import type { TaskController } from './task.controller.js';

export function buildTaskRouter(
  controller: TaskController,
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('tasks.read'),
    asyncHandler(controller.list),
  );

  router.post(
    '/',
    requirePermission('tasks.create'),
    validate(createTaskSchema),
    asyncHandler(controller.create),
  );

  router.get(
    '/:id',
    requirePermission('tasks.read'),
    validate(taskIdParamSchema, 'params'),
    asyncHandler(controller.getById),
  );

  router.patch(
    '/:id',
    requirePermission('tasks.update'),
    validate(taskIdParamSchema, 'params'),
    validate(patchTaskSchema),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    requirePermission('tasks.delete'),
    validate(taskIdParamSchema, 'params'),
    asyncHandler(controller.softDelete),
  );

  return router;
}
