// CRM-10.2 — Webhook BullMQ worker.
//
// Sprint 5: stub handlers. Sprint 6 M2: instagram-webhook-subscribe job.
// Sprint 6 M3: full Instagram DM receive pipeline in handleInstagram().
//
// DB access uses the base prisma client for cross-tenant lookups (account resolution,
// webhook_events backfill). Tenant-scoped mutations run inside withTenant().

import type { Prisma } from '@prisma/client';
import type { Job } from 'bullmq';
import { prisma } from '../../prisma/client.js';
import { enqueue } from '../queues.js';
import { QUEUE } from '../names.js';
import { logger } from '../../observability/logger.js';
import { moveToDeadLetter } from '../dlq.js';
import { withTenant } from '../../tenancy/with-tenant.js';
import { asTenantCreate } from '../../tenancy/tenant-repository.js';
import {
  PrismaConversationRepository,
  PrismaMessageRepository,
} from '../../../modules/inbox/inbox.repository.js';
import type { WebhookSource } from '@leados/shared';

export const WEBHOOK_JOB = 'webhook-event';
export const INSTAGRAM_WEBHOOK_SUBSCRIBE_JOB = 'instagram-webhook-subscribe';
export const INSTAGRAM_ENRICH_JOB = 'instagram-enrich';

export interface InstagramWebhookSubscribePayload {
  igUserId: string;
  igAccountId: string;
  orgId: string;
}

export interface InstagramEnrichPayload {
  conversationId: string;
  senderIgUserId: string;
  leadId: string | null;
  orgId: string;
  igAccountId: string;
}

export interface WebhookJobPayload {
  webhookEventId: string;
  source: string;
}

// ─── instagram-webhook-subscribe job ─────────────────────────────────────────

export async function processInstagramWebhookSubscribeJob(
  job: Job<InstagramWebhookSubscribePayload>,
): Promise<void> {
  const { igUserId, igAccountId, orgId } = job.data;
  const { instagramAdapter } = await import('../../../modules/instagram/instagram.adapter.js');
  const { PrismaInstagramAccountRepository } = await import(
    '../../../modules/instagram/instagram.repository.js'
  );
  const { decryptField } = await import('../../crypto/field-encryption.js');

  await withTenant(orgId, async (db) => {
    const repo = new PrismaInstagramAccountRepository(db);
    const account = await repo.findByIdOrThrow(igAccountId);
    const plainToken = decryptField(account.accessToken);
    await instagramAdapter.subscribeWebhook(igUserId, plainToken);
    await repo.update(igAccountId, { webhookSubscribed: true });
  });

  logger.info({ message: 'Instagram webhook subscription completed', igUserId, igAccountId });
}

// ─── instagram-enrich job (lead enrichment — deferred, stub in M3) ───────────

export async function processInstagramEnrichJob(
  job: Job<InstagramEnrichPayload>,
): Promise<void> {
  // Lead enrichment via getSenderProfile() is deferred to a later milestone.
  // The job is enqueued by handleInstagram() so retries work automatically when implemented.
  logger.info({ message: 'Instagram enrich job received (deferred)', ...job.data });
}

// ─── Main webhook job ─────────────────────────────────────────────────────────

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
    await dispatch(source as WebhookSource, event.payload, webhookEventId);

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

async function dispatch(source: WebhookSource, payload: unknown, webhookEventId: string): Promise<void> {
  switch (source) {
    case 'INSTAGRAM':
      await handleInstagram(payload, webhookEventId);
      break;
    case 'STRIPE':
      await handleStripe(payload);
      break;
    default:
      await handleSystem(payload);
  }
}

// ─── Instagram DM receive pipeline ───────────────────────────────────────────

async function handleInstagram(payload: unknown, webhookEventId: string): Promise<void> {
  const p = payload as { object?: string; entry?: unknown[] } | null;

  if (!p || !Array.isArray(p.entry) || p.entry.length === 0) {
    logger.info({ message: 'Instagram webhook: no entries', webhookEventId });
    return;
  }

  for (const rawEntry of p.entry) {
    const entry = rawEntry as Record<string, unknown>;
    const messaging = entry['messaging'];
    if (!Array.isArray(messaging)) continue;

    for (let i = 0; i < messaging.length; i++) {
      const msgEvent = messaging[i] as Record<string, unknown>;
      try {
        await processInstagramMessage(msgEvent, webhookEventId);
      } catch (err) {
        logger.warn({
          message: 'Instagram webhook: message event error (continuing batch)',
          webhookEventId,
          index: i,
          error: String(err),
        });
      }
    }
  }
}

async function processInstagramMessage(
  msgEvent: Record<string, unknown>,
  webhookEventId: string,
): Promise<void> {
  // Only process inbound message events (skip read receipts, reactions, delivery reports)
  const message = msgEvent['message'] as Record<string, unknown> | undefined;
  const mid = message?.['mid'] as string | undefined;
  if (!mid || !message) return;

  const recipient = msgEvent['recipient'] as Record<string, unknown> | undefined;
  const sender = msgEvent['sender'] as Record<string, unknown> | undefined;
  const recipientIgUserId = String(recipient?.['id'] ?? '');
  const senderIgUserId = String(sender?.['id'] ?? '');
  const timestamp = (msgEvent['timestamp'] as number | undefined) ?? Date.now();

  if (!recipientIgUserId || !senderIgUserId) {
    logger.warn({ message: 'Instagram message missing sender/recipient', mid });
    return;
  }

  // Resolve the instagram_account by the recipient's igUserId (cross-tenant lookup — base prisma)
  const account = await prisma.instagramAccount.findFirst({
    where: { igUserId: recipientIgUserId, deletedAt: null },
    select: { id: true, organizationId: true },
  });

  if (!account) {
    logger.warn({ message: 'No instagram account for recipient, skipping', recipientIgUserId, mid });
    return;
  }

  const orgId = account.organizationId;
  const igAccountId = account.id;

  // Find a system user for createdById on new leads (first active member by join date)
  const systemMember = await prisma.organizationMember.findFirst({
    where: { organizationId: orgId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  });
  const systemUserId = systemMember?.userId;

  if (!systemUserId) {
    logger.warn({ message: 'No active org member for lead createdById, skipping', orgId, mid });
    return;
  }

  let conversationId: string | null = null;
  let messageId: string | null = null;

  await withTenant(orgId, async (db) => {
    const convRepo = new PrismaConversationRepository(db);
    const msgRepo = new PrismaMessageRepository(db);

    // igConversationId: deterministic stable key for this (recipient, sender) pair
    const igConversationId = `${recipientIgUserId}_${senderIgUserId}`;
    const sentAt = new Date(timestamp);

    // 1. Upsert conversation (idempotent — unique on organizationId + igConversationId)
    const conversation = await convRepo.upsertByIgConversationId({
      igConversationId,
      igAccountId,
      lastMessageAt: sentAt,
    });

    // 2. Create message — dedup by mid (returns null if mid already exists)
    const text = message['text'] as string | undefined;
    const contentType = text !== undefined ? 'TEXT' : 'ATTACHMENT';
    const content: Record<string, unknown> = text !== undefined ? { text } : { raw: message };

    const newMsg = await msgRepo.createIfNotExists({
      mid,
      conversationId: conversation.id,
      direction: 'INBOUND',
      contentType,
      content,
      sentAt,
      senderId: senderIgUserId,
    });

    if (!newMsg) {
      logger.debug({ message: 'Duplicate mid, skipping remaining steps', mid });
      return;
    }

    conversationId = conversation.id;
    messageId = newMsg.id;

    // 3. Find or create lead by instagramUserId
    const lead = await findOrCreateLead(db, senderIgUserId, systemUserId);

    // 4. Link lead to conversation if not yet linked
    if (!conversation.leadId && lead) {
      await convRepo.update(conversation.id, { leadId: lead.id });
    }

    // 5. Update conversation's lastInboundAt (tracks 24h messaging window)
    await convRepo.update(conversation.id, { lastInboundAt: sentAt });

    // 6. Enqueue lead enrichment (always deferred — signoff SCALE-1)
    await enqueue(QUEUE.WEBHOOK_PROCESSING, INSTAGRAM_ENRICH_JOB, {
      conversationId: conversation.id,
      senderIgUserId,
      leadId: lead?.id ?? null,
      orgId,
      igAccountId,
    });
  });

  // 7. Backfill webhook_events.organizationId (outside tenant scope — base prisma)
  await prisma.webhookEvent.updateMany({
    where: { id: webhookEventId, organizationId: null },
    data: { organizationId: orgId },
  });

  // 8. Fire-and-forget realtime notification to org room (non-fatal if Redis unavailable)
  if (conversationId && messageId) {
    try {
      const { notifyOrg } = await import('../../realtime/notification-publisher.js');
      notifyOrg(orgId, 'instagram:message', { conversationId, messageId });
    } catch (err) {
      logger.warn({ message: 'Socket.io notification failed (non-fatal)', orgId, error: String(err) });
    }
  }
}

/**
 * Find an existing non-deleted lead by instagramUserId, or create one.
 * Catches P2002 (concurrent creation) and re-queries.
 * Per FINAL_ARCHITECTURE_SIGNOFF §5.3.
 */
async function findOrCreateLead(
  db: import('../../tenancy/with-tenant.js').TenantTransactionClient,
  senderIgUserId: string,
  systemUserId: string,
): Promise<{ id: string } | null> {
  // 1. Try to find existing non-deleted lead
  const existing = await db.lead.findFirst({
    where: { instagramUserId: senderIgUserId, deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing;

  // 2. Create new lead
  try {
    return await db.lead.create({
      data: asTenantCreate<Prisma.LeadUncheckedCreateInput>({
        firstName: `IG User`,
        source: 'INSTAGRAM_DM',
        status: 'NEW',
        instagramUserId: senderIgUserId,
        tags: [],
        customFields: {} as Prisma.InputJsonValue,
        createdById: systemUserId,
      }),
      select: { id: true },
    });
  } catch (err) {
    if (isPrismaP2002(err)) {
      // Concurrent create of same instagramUserId lead — re-query (may include soft-deleted)
      return db.lead.findFirst({
        where: { instagramUserId: senderIgUserId },
        select: { id: true },
      });
    }
    throw err;
  }
}

function isPrismaP2002(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

// ─── Stripe / System stubs ────────────────────────────────────────────────────

async function handleStripe(payload: unknown): Promise<void> {
  const p = payload as Record<string, unknown> | null;
  logger.info({ message: 'Stripe webhook received', eventType: p?.['type'], eventId: p?.['id'] });
}

async function handleSystem(payload: unknown): Promise<void> {
  logger.info({ message: 'System webhook received', payload });
}

// ─── Startup reconciliation ───────────────────────────────────────────────────

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
