// File module composition root.

import { Router, type RequestHandler } from 'express';
import { PrismaAuditRecorder } from '../../core/audit/audit-recorder.js';
import { FileService } from './file.service.js';
import { createFileController } from './file.controller.js';
import { buildFileRouter } from './file.routes.js';

export function buildFilesModule(
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const service = new FileService(new PrismaAuditRecorder());
  const controller = createFileController(service);
  return buildFileRouter(controller, requirePermission);
}
