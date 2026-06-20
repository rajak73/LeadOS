// Deal module composition root — the only import surface that app.ts touches.
// Wires: DealService → DealController → Router.

import { Router, type RequestHandler } from 'express';
import { DealService } from './deal.service.js';
import { createDealController } from './deal.controller.js';
import { buildDealRouter } from './deal.routes.js';

export function buildDealsModule(
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const service = new DealService();
  const controller = createDealController(service);
  return buildDealRouter(controller, requirePermission);
}
