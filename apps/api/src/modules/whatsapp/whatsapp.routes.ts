// WhatsApp routes — authenticated REST API and webhook receiver.
//
// Two routers:
//   buildWhatsAppWebhookRouter() — PUBLIC; handles GET verification challenge and POST webhooks.
//     Mounted in app.ts at /api/webhooks/whatsapp (needs raw body for HMAC).
//   buildWhatsAppRouter(requirePermission) — AUTHENTICATED; mounts on /whatsapp
//     inside the /api/v1 authenticated chain.

import { Router, type RequestHandler, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validate } from '../../core/middleware/validate.js';
import { logger } from '../../core/observability/logger.js';
import { env } from '../../core/config/env.js';
import { prisma } from '../../core/prisma/client.js';
import { enqueue } from '../../core/queue/queues.js';
import { QUEUE } from '../../core/queue/names.js';
import { whatsappAdapter } from './whatsapp.adapter.js';
import type { WhatsAppController } from './whatsapp.controller.js';

const accountParamSchema = z.object({ id: z.string().uuid() });
const accountIdParamSchema = z.object({ accountId: z.string().uuid() });

const connectAccountSchema = z.object({
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  displayName: z.string().min(1),
  phoneNumber: z.string().min(1),
  accessToken: z.string().min(1),
});

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  accountId: z.string().uuid(),
  text: z.string().optional(),
  templateName: z.string().optional(),
  templateLanguage: z.string().optional(),
});

/**
 * Public webhook router — mounted at /api/webhooks/whatsapp (raw body middleware already applied).
 * GET: Meta hub challenge verification.
 * POST: Inbound message event ingestion.
 */
export function buildWhatsAppWebhookRouter(): Router {
  const router = Router();

  // GET /api/webhooks/whatsapp — Meta hub.challenge verification
  router.get('/', (req: Request, res: Response): void => {
    const mode = req.query['hub.mode'] as string | undefined;
    const token = req.query['hub.verify_token'] as string | undefined;
    const challenge = req.query['hub.challenge'] as string | undefined;

    if (mode === 'subscribe' && token === env.META_WHATSAPP_VERIFY_TOKEN) {
      logger.info({ message: 'WhatsApp webhook verified' });
      res.status(200).send(challenge ?? '');
    } else {
      res.status(403).json({ error: 'Verification failed' });
    }
  });

  // POST /api/webhooks/whatsapp — Inbound events from Meta
  router.post('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // rawBody is set by express.raw() middleware mounted in app.ts
    const rawBody = req.body as Buffer;
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    // Signature verification — reject if invalid
    if (!signature || !whatsappAdapter.verifyWebhookSignature(rawBody, signature, env.META_APP_SECRET)) {
      logger.warn({ message: 'WhatsApp webhook: invalid signature, rejecting' });
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    // Acknowledge immediately per Meta requirement
    res.status(200).json({ received: true });

    // Persist webhook event and enqueue for async processing
    try {
      const event = await prisma.webhookEvent.create({
        data: {
          source: 'WHATSAPP',
          externalEventId: `wa-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
          payload: payload as import('@prisma/client').Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });
      const jobId = await enqueue(QUEUE.WEBHOOK_PROCESSING, 'webhook-event', {
        webhookEventId: event.id,
        source: 'WHATSAPP',
      });
      void jobId;
    } catch (err) {
      logger.error({ message: 'WhatsApp webhook: failed to persist event', error: String(err) });
    }
  }));

  return router;
}

/** Authenticated router — mounted inside /api/v1/whatsapp with full auth + tenant middleware. */
export function buildWhatsAppRouter(
  controller: WhatsAppController,
  requirePermission: (permission: string) => RequestHandler,
): Router {
  const router = Router();

  // POST /api/v1/whatsapp/accounts → connect a WABA account
  router.post(
    '/accounts',
    requirePermission('org.connect_social'),
    validate(connectAccountSchema, 'body'),
    asyncHandler(controller.connectAccount),
  );

  // GET /api/v1/whatsapp/accounts → list connected accounts
  router.get(
    '/accounts',
    requirePermission('org.connect_social'),
    asyncHandler(controller.listAccounts),
  );

  // DELETE /api/v1/whatsapp/accounts/:id → disconnect account
  router.delete(
    '/accounts/:id',
    requirePermission('org.connect_social'),
    validate(accountParamSchema, 'params'),
    asyncHandler(controller.disconnectAccount),
  );

  // POST /api/v1/whatsapp/accounts/:accountId/sync-templates → sync templates from Meta
  router.post(
    '/accounts/:accountId/sync-templates',
    requirePermission('org.connect_social'),
    validate(accountIdParamSchema, 'params'),
    asyncHandler(controller.syncTemplates),
  );

  // GET /api/v1/whatsapp/accounts/:accountId/templates → list cached templates
  router.get(
    '/accounts/:accountId/templates',
    requirePermission('inbox.read'),
    validate(accountIdParamSchema, 'params'),
    asyncHandler(controller.listTemplates),
  );

  // POST /api/v1/whatsapp/send → send a message
  router.post(
    '/send',
    requirePermission('inbox.reply'),
    validate(sendMessageSchema, 'body'),
    asyncHandler(controller.sendMessage),
  );

  return router;
}
