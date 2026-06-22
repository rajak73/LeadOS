// Sprint 7 M1 — Notification routes. Notifications are inherently per-user; there is no
// dedicated RBAC permission. The /api/v1 chain already applies auth + tenant middleware,
// and every handler is self-scoped by the service to the authenticated user (DM1-b).
// The requirePermission argument is accepted for builder-signature consistency only.

import { Router } from 'express';
import type { RequestHandler } from 'express';
import { buildNotificationController } from './notification.controller.js';

export function buildNotificationRouter(_requirePermission: (permission: string) => RequestHandler): Router {
  const router = Router();
  const ctrl = buildNotificationController();

  // GET /notifications?unread=&cursor=&limit=
  router.get('/', (req, res, next) => ctrl.list(req, res).catch(next));

  // GET /notifications/preferences  (declared before /:id to avoid param capture)
  router.get('/preferences', (req, res, next) => ctrl.getPreferences(req, res).catch(next));

  // PUT /notifications/preferences
  router.put('/preferences', (req, res, next) => ctrl.updatePreferences(req, res).catch(next));

  // POST /notifications/read  (bulk / mark-all)
  router.post('/read', (req, res, next) => ctrl.markAllRead(req, res).catch(next));

  // POST /notifications/:id/read
  router.post('/:id/read', (req, res, next) => ctrl.markRead(req, res).catch(next));

  return router;
}
