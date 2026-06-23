import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createAnalyticsController } from './analytics.controller.js';
import { asyncHandler } from '../../core/http/async-handler.js';

export function buildAnalyticsRouter(requirePermission: (permission: string) => RequestHandler): Router {
  const router = Router();
  const ctrl = createAnalyticsController();

  router.get('/dashboard', requirePermission('leads.read'), asyncHandler(ctrl.getDashboardSummary));

  return router;
}
