// Task module composition root.

import { Router, type RequestHandler } from 'express';
import { PrismaAuditRecorder } from '../../core/audit/audit-recorder.js';
import { TaskService } from './task.service.js';
import { createTaskController } from './task.controller.js';
import { buildTaskRouter } from './task.routes.js';

export function buildTasksModule(
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const service = new TaskService(new PrismaAuditRecorder());
  const controller = createTaskController(service);
  return buildTaskRouter(controller, requirePermission);
}
