// Note module composition root.

import { Router, type RequestHandler } from 'express';
import { PrismaAuditRecorder } from '../../core/audit/audit-recorder.js';
import { NoteService } from './note.service.js';
import { createNoteController } from './note.controller.js';
import { buildNoteRouter } from './note.routes.js';

export function buildNotesModule(
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const service = new NoteService(new PrismaAuditRecorder());
  const controller = createNoteController(service);
  return buildNoteRouter(controller, requirePermission);
}
