import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createWorkflowController } from './workflow.controller.js';
import { asyncHandler } from '../../core/http/async-handler.js';

export function buildWorkflowRouter(requirePermission: (permission: string) => RequestHandler): Router {
  const router = Router();
  const ctrl = createWorkflowController();

  // GET /api/v1/workflows/meta → returns triggers, actions catalog
  router.get('/meta', requirePermission('workflows.read'), asyncHandler(ctrl.getWorkflowMetadata));

  // GET /api/v1/workflows/runs → returns all runs
  router.get('/runs', requirePermission('workflows.read'), asyncHandler(ctrl.listRuns));

  // GET /api/v1/workflows/:id/runs → returns runs for a specific workflow
  router.get('/:id/runs', requirePermission('workflows.read'), asyncHandler(ctrl.listRuns));

  // GET /api/v1/workflows → list all workflows
  router.get('/', requirePermission('workflows.read'), asyncHandler(ctrl.listWorkflows));

  // GET /api/v1/workflows/:id → retrieve single workflow
  router.get('/:id', requirePermission('workflows.read'), asyncHandler(ctrl.getWorkflow));

  // POST /api/v1/workflows → create workflow
  router.post('/', requirePermission('workflows.create'), asyncHandler(ctrl.createWorkflow));

  // PATCH /api/v1/workflows/:id → update workflow
  router.patch('/:id', requirePermission('workflows.update'), asyncHandler(ctrl.updateWorkflow));

  // DELETE /api/v1/workflows/:id → delete workflow
  router.delete('/:id', requirePermission('workflows.delete'), asyncHandler(ctrl.deleteWorkflow));

  return router;
}
