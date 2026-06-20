// CRM-10.1 — Webhook event persistence and idempotency.
//
// Uses the base prisma client (no withTenant) because organizationId is null at receive
// time for all Sprint 5 events. Sprint 6+ handlers backfill organizationId after resolution.
//
// Idempotency contract:
//   - Unique constraint on (source, externalEventId) is the primary guard.
//   - Duplicate detected → existing row updated to SKIPPED; caller returns 200.
//   - SKIPPED row encountered by worker → worker exits early (no processing).

import { prisma } from '../../core/prisma/client.js';
import { enqueue } from '../../core/queue/queues.js';
import { QUEUE } from '../../core/queue/names.js';
import { logger } from '../../core/observability/logger.js';
import { WEBHOOK_JOB } from '../../core/queue/workers/webhook.worker.js';
import type { WebhookSource } from '@leados/shared';

export interface PersistResult {
  webhookEventId: string;
  created: boolean;
  skipped: boolean;
}

export async function persistAndEnqueue(
  source: WebhookSource,
  externalEventId: string,
  payload: unknown,
  rawHeaders: Record<string, string | string[] | undefined>,
): Promise<PersistResult> {
  try {
    const event = await prisma.webhookEvent.create({
      data: {
        source,
        externalEventId,
        payload: payload as object,
        rawHeaders: rawHeaders as object,
        status: 'PENDING',
        attempts: 0,
      },
      select: { id: true },
    });

    await enqueue(QUEUE.WEBHOOK_PROCESSING, WEBHOOK_JOB, {
      webhookEventId: event.id,
      source,
    });

    logger.info({ message: 'Webhook event persisted and enqueued', source, externalEventId, id: event.id });
    return { webhookEventId: event.id, created: true, skipped: false };
  } catch (err: unknown) {
    if (!isPrismaUniqueError(err)) throw err;

    // Duplicate externalEventId — idempotent path
    const existing = await prisma.webhookEvent.findFirst({
      where: { source, externalEventId },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new Error(`Idempotency race: event not found after conflict: ${source}/${externalEventId}`);
    }

    const { id: webhookEventId, status } = existing;

    if (status === 'DONE' || status === 'SKIPPED') {
      logger.info({ message: 'Duplicate webhook event, already terminal', source, externalEventId, status });
      return { webhookEventId, created: false, skipped: true };
    }

    if (status === 'FAILED') {
      // Source is retrying a previously failed event — re-enqueue for another attempt
      await enqueue(QUEUE.WEBHOOK_PROCESSING, WEBHOOK_JOB, { webhookEventId, source });
      logger.info({ message: 'Duplicate webhook event, re-enqueuing failed event', source, externalEventId });
      return { webhookEventId, created: false, skipped: false };
    }

    // PENDING or PROCESSING: mark SKIPPED to cancel processing; worker guards on this status
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: 'SKIPPED' },
    });

    logger.info({ message: 'Duplicate webhook event, marked SKIPPED', source, externalEventId, status });
    return { webhookEventId, created: false, skipped: true };
  }
}

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}
