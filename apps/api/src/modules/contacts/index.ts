// Contact module composition root — the only import surface that app.ts touches.
// Wires: AuditRecorder → ContactService → ContactController → Router.

import { Router, type RequestHandler } from 'express';
import { PrismaAuditRecorder } from '../../core/audit/audit-recorder.js';
import { ContactService } from './contact.service.js';
import { createContactController } from './contact.controller.js';
import { buildContactRouter } from './contact.routes.js';

export function buildContactsModule(
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const service = new ContactService(new PrismaAuditRecorder());
  const controller = createContactController(service);
  return buildContactRouter(controller, requirePermission);
}
