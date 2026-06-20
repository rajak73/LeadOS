// Instagram routes.
//
// Two routers:
//   buildInstagramCallbackRouter() — PUBLIC; mounts GET /callback.
//     Mounted in app.ts at /api/instagram (outside auth chain).
//   buildInstagramRouter(requirePermission) — AUTHENTICATED; mounts on /instagram
//     inside the /api/v1 authenticated chain.

import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validate } from '../../core/middleware/validate.js';
import type { InstagramController } from './instagram.controller.js';

const accountParamSchema = z.object({ id: z.string().uuid() });

/** Public router — mounts GET /callback. No auth or tenant middleware. */
export function buildInstagramCallbackRouter(controller: InstagramController): Router {
  const router = Router();
  router.get('/callback', asyncHandler(controller.handleCallback));
  return router;
}

/** Authenticated router — mounted inside /api/v1 with full auth + tenant middleware. */
export function buildInstagramRouter(
  controller: InstagramController,
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();

  // GET /api/v1/instagram/auth → returns Meta OAuth redirect URL
  router.get('/auth', requirePermission('org.connect_social'), asyncHandler(controller.initiateOAuth));

  // GET /api/v1/instagram/accounts → list connected accounts
  router.get('/accounts', requirePermission('org.connect_social'), asyncHandler(controller.listAccounts));

  // DELETE /api/v1/instagram/accounts/:id → disconnect account
  router.delete(
    '/accounts/:id',
    requirePermission('org.connect_social'),
    validate(accountParamSchema, 'params'),
    asyncHandler(controller.disconnectAccount),
  );

  return router;
}
