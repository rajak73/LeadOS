// CRM-10.2 — Webhook BullMQ worker (Sprint 5 skeleton).
//
// Sprint 5 handlers log the event and mark it DONE. Real handlers (Instagram message
// processing, Stripe billing updates) land in Sprint 6+ and call withTenant() themselves
// once they resolve an organizationId from the event payload.
//
// DB access uses the base prisma client (no withTenant, no GUC) because:
//   - organizationId is null for all Sprint 5 events
//   - webhook_select and webhook_update RLS policies admit NULL-org rows
//   - the admin prisma singleton bypasses RLS as a backstop

import type { Job } from 'bullmq';
import { prisma } from '../../prisma/client.js';
import { enqueue } from '../queues.js';
import { QUEUE } from '../names.js';
import { logger } from '../../observability/logger.js';
import { moveToDeadLetter } from '../dlq.js';
import type { WebhookSource } from '@leados/shared';

export const WEBHOOK_JOB = 'webhook-event';

export interface WebhookJobPayload {
  webhookEventId: string;
  source: string;
}

export async function processWebhookJob(job: Job<WebhookJobPayload>): Promise<void> {
  const { webhookEventId, source } = job.data;

  const event = await prisma.webhookEvent.findUnique({ where: { id: webhookEventId } });
  if (!event) {
    logger.warn({ message: 'Webhook event not found', webhookEventId });
    return;
  }

  if (event.status === 'DONE' || event.status === 'SKIPPED') {
    logger.debug({ message: 'Webhook event already terminal, skipping', webhookEventId, status: event.status });
    return;
  }

  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, lastAttemptAt: new Date() },
  });

  try {
    await dispatch(source as WebhookSource, event.payload);

    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: 'DONE', processedAt: new Date() },
    });

    logger.info({ message: 'Webhook event processed', webhookEventId, source });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: 'FAILED', errorMessage: message },
    });

    const exhausted = job.attemptsMade >= ((job.opts.attempts ?? 1) - 1);
    if (exhausted) {
      await moveToDeadLetter(QUEUE.WEBHOOK_PROCESSING, job.id, job.data, message);
    }

    logger.warn({ message: 'Webhook event processing failed', webhookEventId, source, error: message });
    throw err;
  }
}

async function dispatch(source: WebhookSource, payload: unknown): Promise<void> {
  switch (source) {
    case 'INSTAGRAM':
      await handleInstagram(payload);
      break;
    case 'STRIPE':
      await handleStripe(payload);
      break;
    default:
      await handleSystem(payload);
  }
}

async function handleInstagram(payload: unknown): Promise<void> {
  const p = payload as Record<string, unknown> | null;
  logger.info({
    message: 'Instagram webhook received',
    object: p?.['object'],
    entryCount: Array.isArray(p?.['entry']) ? (p['entry'] as unknown[]).length : 0,
  });
}

async function handleStripe(payload: unknown): Promise<void> {
  const p = payload as Record<string, unknown> | null;
  logger.info({
    message: 'Stripe webhook received',
    eventType: p?.['type'],
    eventId: p?.['id'],
  });
}

async function handleSystem(payload: unknown): Promise<void> {
  logger.info({ message: 'System webhook received', payload });
}

// Re-enqueue PENDING events older than 5 minutes that were orphaned by an API crash
// after the DB write but before the Redis enqueue. Called once on worker startup.
export async function reEnqueueStalePendingWebhooks(): Promise<void> {
  const staleEvents = await prisma.$queryRaw<{ id: string; source: string }[]>`
    SELECT id, source
    FROM webhook_events
    WHERE status = 'PENDING'
      AND "createdAt" < now() - INTERVAL '5 minutes'
  `;

  if (staleEvents.length === 0) return;

  logger.info({ message: 'Re-enqueueing stale PENDING webhook events', count: staleEvents.length });

  for (const event of staleEvents) {
    await enqueue(QUEUE.WEBHOOK_PROCESSING, WEBHOOK_JOB, {
      webhookEventId: event.id,
      source: event.source,
    });
    logger.info({ message: 'Re-enqueued stale webhook event', webhookEventId: event.id });
  }
}
