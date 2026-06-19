// Lead module composition root — the only import surface that app.ts touches.
// Wires: AuditRecorder → LeadService → LeadController → Router.

import { Router, type RequestHandler } from 'express';
import { PrismaAuditRecorder } from '../../core/audit/audit-recorder.js';
import { LeadService } from './lead.service.js';
import { createLeadController } from './lead.controller.js';
import { buildLeadRouter } from './lead.routes.js';

export function buildLeadsModule(
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const service = new LeadService(new PrismaAuditRecorder());
  const controller = createLeadController(service);
  return buildLeadRouter(controller, requirePermission);
}
