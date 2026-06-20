// CRM-10.1 — Webhook receiver controllers.
//
// HMAC verification uses crypto.timingSafeEqual to prevent timing side channels.
// req.body is a raw Buffer (express.raw() is mounted before express.json() in app.ts).
// Invalid signature → 400 (NOT 401 — Meta interprets 4xx as delivery failure and retries).
// Persist-then-200 contract: DB write must succeed before 200 is sent.

import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../../core/config/env.js';
import { logger } from '../../core/observability/logger.js';
import { persistAndEnqueue } from './webhook.service.js';

// ─── Instagram ────────────────────────────────────────────────────────────────

export async function verifyInstagramChallenge(req: Request, res: Response): Promise<void> {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    logger.info({ message: 'Instagram webhook challenge verified' });
    res.status(200).send(String(challenge));
    return;
  }

  logger.warn({ message: 'Instagram webhook challenge failed', mode, token: typeof token });
  res.status(403).json({ error: 'Forbidden' });
}

export async function receiveInstagram(req: Request, res: Response): Promise<void> {
  const sigHeader = req.headers['x-hub-signature-256'];
  const rawBody = req.body as Buffer;

  if (!sigHeader || typeof sigHeader !== 'string') {
    logger.warn({ message: 'Instagram webhook missing signature header' });
    res.status(400).json({ error: 'Missing X-Hub-Signature-256' });
    return;
  }

  const received = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader;
  const computed = crypto
    .createHmac('sha256', env.INSTAGRAM_APP_SECRET)
    .update(rawBody)
    .digest('hex');

  if (!timingSafeCompareHex(computed, received)) {
    logger.warn({ message: 'Instagram webhook invalid signature' });
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  const payload = parseBody(rawBody);
  const externalEventId = extractInstagramEventId(payload);

  const safeHeaders: Record<string, string | string[] | undefined> = {
    'x-hub-signature-256': req.headers['x-hub-signature-256'],
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent'],
  };

  const result = await persistAndEnqueue('INSTAGRAM', externalEventId, payload, safeHeaders);

  logger.info({
    message: 'Instagram webhook received',
    externalEventId,
    created: result.created,
    skipped: result.skipped,
  });

  res.status(200).json({ received: true });
}

// ─── Stripe ───────────────────────────────────────────────────────────────────

export async function receiveStripe(req: Request, res: Response): Promise<void> {
  const sigHeader = req.headers['stripe-signature'];
  const rawBody = req.body as Buffer;

  if (!sigHeader || typeof sigHeader !== 'string') {
    logger.warn({ message: 'Stripe webhook missing signature header' });
    res.status(400).json({ error: 'Missing Stripe-Signature' });
    return;
  }

  if (!verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET)) {
    logger.warn({ message: 'Stripe webhook invalid signature' });
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  const payload = parseBody(rawBody);
  const externalEventId = extractStripeEventId(payload);

  const safeHeaders: Record<string, string | string[] | undefined> = {
    'stripe-signature': req.headers['stripe-signature'],
    'content-type': req.headers['content-type'],
  };

  const result = await persistAndEnqueue('STRIPE', externalEventId, payload, safeHeaders);

  logger.info({
    message: 'Stripe webhook received',
    externalEventId,
    created: result.created,
    skipped: result.skipped,
  });

  res.status(200).json({ received: true });
}

// ─── HMAC helpers ─────────────────────────────────────────────────────────────

function timingSafeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function verifyStripeSignature(rawBody: Buffer, sigHeader: string, secret: string): boolean {
  // Header format: t=<timestamp>,v1=<hex1>,v1=<hex2>,...
  const parts = sigHeader.split(',');
  let timestamp: string | null = null;
  const v1Sigs: string[] = [];

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx);
    const val = part.slice(eqIdx + 1);
    if (key === 't') timestamp = val;
    else if (key === 'v1') v1Sigs.push(val);
  }

  if (!timestamp || v1Sigs.length === 0) return false;

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > 300) {
    logger.warn({ message: 'Stripe webhook timestamp out of tolerance', ts, now: nowSeconds });
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody.toString('utf-8')}`;
  const computed = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  return v1Sigs.some((sig) => timingSafeCompareHex(computed, sig));
}

// ─── Payload helpers ──────────────────────────────────────────────────────────

function parseBody(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString('utf-8'));
  } catch {
    return null;
  }
}

function extractInstagramEventId(payload: unknown): string {
  const p = payload as Record<string, unknown> | null;
  const entries = p?.['entry'];
  if (Array.isArray(entries) && entries.length > 0) {
    const entry = entries[0] as Record<string, unknown>;
    const messaging = entry['messaging'];
    if (Array.isArray(messaging) && messaging.length > 0) {
      const mid = (messaging[0] as Record<string, unknown>)['mid'];
      if (typeof mid === 'string' && mid.length > 0) return mid;
    }
    const entryId = String(entry['id'] ?? '');
    const entryTime = String(entry['time'] ?? '');
    if (entryId || entryTime) return `ig_${entryId}_${entryTime}`;
  }
  return `ig_unknown_${Date.now()}`;
}

function extractStripeEventId(payload: unknown): string {
  const p = payload as Record<string, unknown> | null;
  const id = p?.['id'];
  return typeof id === 'string' && id.length > 0 ? id : `stripe_unknown_${Date.now()}`;
}
