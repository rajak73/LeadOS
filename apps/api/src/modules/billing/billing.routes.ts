import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createBillingController } from './billing.controller.js';
import { asyncHandler } from '../../core/http/async-handler.js';

export function buildBillingRouter(requirePermission: (permission: string) => RequestHandler): Router {
  const router = Router();
  const ctrl = createBillingController();

  // POST /api/v1/billing/checkout -> Create a checkout session
  router.post('/checkout', requirePermission('billing.manage'), asyncHandler(ctrl.createCheckoutSession));

  // POST /api/v1/billing/portal -> Redirect to the billing portal
  router.post('/portal', requirePermission('billing.manage'), asyncHandler(ctrl.createPortalSession));

  // GET /api/v1/billing/subscription -> Retrieve active subscription details
  router.get('/subscription', requirePermission('billing.read'), asyncHandler(ctrl.getSubscription));

  return router;
}
