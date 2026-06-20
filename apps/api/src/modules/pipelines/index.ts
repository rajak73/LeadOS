// Pipeline module composition root — the only import surface that app.ts touches.
// Wires: PipelineService → PipelineController → Router.

import { Router, type RequestHandler } from 'express';
import { PipelineService } from './pipeline.service.js';
import { createPipelineController } from './pipeline.controller.js';
import { buildPipelineRouter } from './pipeline.routes.js';

export function buildPipelinesModule(
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const service = new PipelineService();
  const controller = createPipelineController(service);
  return buildPipelineRouter(controller, requirePermission);
}
