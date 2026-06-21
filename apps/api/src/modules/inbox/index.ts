// Inbox module composition root.
// buildInboxModule(requirePermission) returns an Express Router mounted at /inbox.

import type { Router } from 'express';
import { buildInboxRouter } from './inbox.routes.js';

export function buildInboxModule(
  requirePermission: (permission: string) => import('express').RequestHandler,
): Router {
  return buildInboxRouter(requirePermission);
}
