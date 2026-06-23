// WhatsApp module composition root.
// app.ts imports buildWhatsAppWebhookModule (public webhook) and buildWhatsAppModule (authenticated).

import { Router, type RequestHandler } from 'express';
import { WhatsAppService } from './whatsapp.service.js';
import { createWhatsAppController } from './whatsapp.controller.js';
import { buildWhatsAppWebhookRouter, buildWhatsAppRouter } from './whatsapp.routes.js';

export type { WhatsAppService };

/** Public webhook router — mount at /api/webhooks/whatsapp in app.ts (raw body already applied). */
export function buildWhatsAppWebhookModule(): Router {
  return buildWhatsAppWebhookRouter();
}

/** Authenticated router — mount at /whatsapp inside /api/v1 in app.ts. */
export function buildWhatsAppModule(
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const service = new WhatsAppService();
  const controller = createWhatsAppController(service);
  return buildWhatsAppRouter(controller, requirePermission);
}
