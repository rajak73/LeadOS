// Sprint 7 M1 — Notifications module composition root.

import type { Router, RequestHandler } from 'express';
import { buildNotificationRouter } from './notification.routes.js';

export { NotificationService } from './notification.service.js';
export type { NotifyInput } from './notification.service.js';

export function buildNotificationsModule(
  requirePermission: (permission: string) => RequestHandler,
): Router {
  return buildNotificationRouter(requirePermission);
}
