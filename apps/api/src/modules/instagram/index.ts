// Instagram module composition root.
// app.ts imports buildInstagramCallbackRouter (public) and buildInstagramModule (authenticated).

import { Router, type RequestHandler } from 'express';
import { InstagramService } from './instagram.service.js';
import { createInstagramController } from './instagram.controller.js';
import {
  buildInstagramCallbackRouter,
  buildInstagramRouter,
} from './instagram.routes.js';

export type { InstagramService };

/** Public callback router — mount at /api/instagram in app.ts (outside /api/v1). */
export function buildInstagramCallbackModule(): Router {
  const service = new InstagramService();
  const controller = createInstagramController(service);
  return buildInstagramCallbackRouter(controller);
}

/** Authenticated router — mount at /instagram inside /api/v1 in app.ts. */
export function buildInstagramModule(
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const service = new InstagramService();
  const controller = createInstagramController(service);
  return buildInstagramRouter(controller, requirePermission);
}
