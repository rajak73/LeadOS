// Webhook module composition root — the only import surface that app.ts touches.

import { type Router } from 'express';
import { buildWebhookRouter } from './webhook.routes.js';

export function buildWebhooksModule(): Router {
  return buildWebhookRouter();
}
