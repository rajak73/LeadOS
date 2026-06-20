// CRM-10.3 — Webhook routes.
//
// Mounted at /api/webhooks in app.ts — OUTSIDE the /api/v1/ authenticated router.
// express.raw() is already applied at the mount point in app.ts so req.body is a raw
// Buffer on all routes here. No auth, no tenant middleware, no requirePermission().
// Security is HMAC-only (verified in each controller handler).

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler.js';
import {
  verifyInstagramChallenge,
  receiveInstagram,
  receiveStripe,
} from './webhook.controller.js';

export function buildWebhookRouter(): Router {
  const router = Router();

  // Instagram challenge verification (GET) — Meta sends this when setting up the webhook.
  router.get('/instagram', asyncHandler(verifyInstagramChallenge));

  // Instagram event receiver (POST) — live webhook deliveries.
  router.post('/instagram', asyncHandler(receiveInstagram));

  // Stripe event receiver (POST).
  router.post('/stripe', asyncHandler(receiveStripe));

  return router;
}
