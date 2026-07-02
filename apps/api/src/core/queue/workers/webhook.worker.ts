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
import { InteractiveCaptureService, type LeadWithCustomFields } from '../../../modules/inbox/interactive-capture.service.js';

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
    
    if (account.platform === 'FACEBOOK') {
      await instagramAdapter.subscribeFacebookWebhook(igUserId, plainToken);
    } else {
      await instagramAdapter.subscribeWebhook(igUserId, plainToken);
    }
    
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
    case 'WHATSAPP':
      await handleWhatsApp(payload, webhookEventId);
      break;
    default:
      await handleSystem(payload);
  }
}

// ─── Instagram DM receive pipeline ───────────────────────────────────────────

async function handleInstagram(payload: unknown, webhookEventId: string): Promise<void> {
  const p = payload as { object?: string; entry?: unknown[] } | null;

  if (!p || !Array.isArray(p.entry) || p.entry.length === 0) {
    logger.info({ message: 'Meta webhook: no entries', webhookEventId });
    return;
  }

  for (const rawEntry of p.entry) {
    const entry = rawEntry as Record<string, unknown>;
    const entryId = entry['id'] as string | undefined;
    
    // 1. Process messaging (DMs)
    const messaging = entry['messaging'];
    if (Array.isArray(messaging)) {
      for (let i = 0; i < messaging.length; i++) {
        const msgEvent = messaging[i] as Record<string, unknown>;
        const delivery = msgEvent['delivery'] as { mids?: string[]; watermark?: number } | undefined;
        const read = msgEvent['read'] as { watermark?: number } | undefined;

        if (delivery?.mids && delivery.mids.length > 0) {
          await processInstagramDelivery(delivery.mids).catch((err) =>
            logger.warn({ message: 'Meta webhook: delivery status error', webhookEventId, index: i, error: String(err) }),
          );
          continue;
        }

        if (read?.watermark) {
          await processInstagramRead(read.watermark).catch((err) =>
            logger.warn({ message: 'Meta webhook: read status error', webhookEventId, index: i, error: String(err) }),
          );
          continue;
        }

        try {
          await processInstagramMessage(msgEvent, webhookEventId);
        } catch (err) {
          logger.warn({ message: 'Meta webhook: message event error', webhookEventId, index: i, error: String(err) });
        }
      }
    }

    // 2. Process changes (Feed/Comments)
    const changes = entry['changes'];
    if (Array.isArray(changes) && entryId) {
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i] as Record<string, unknown>;
        if (change.field === 'feed' || change.field === 'comments') {
          try {
            await processMetaComment(entryId, change.value as Record<string, unknown>, webhookEventId);
          } catch (err) {
            logger.warn({ message: 'Meta webhook: comment error', webhookEventId, error: String(err) });
          }
        }
      }
    }
  }
}

// ─── Status webhook handlers (M4) ────────────────────────────────────────────

async function processInstagramDelivery(mids: string[]): Promise<void> {
  // Meta's `delivery` event: array of mids that were delivered. Update each.
  // Use base prisma — mids are globally unique, no cross-tenant risk.
  await prisma.message.updateMany({
    where: { mid: { in: mids }, status: { notIn: ['DELIVERED', 'READ'] } },
    data: { status: 'DELIVERED', deliveredAt: new Date() },
  });
  logger.debug({ message: 'Instagram webhook: delivery status updated', mids });
}

async function processInstagramRead(watermark: number): Promise<void> {
  // Meta's `read` event: all OUTBOUND messages with sentAt ≤ watermark are READ.
  const watermarkDate = new Date(watermark);
  await prisma.message.updateMany({
    where: {
      direction: 'OUTBOUND',
      sentAt: { lte: watermarkDate },
      status: { not: 'READ' },
    },
    data: { status: 'READ', readAt: new Date() },
  });
  logger.debug({ message: 'Instagram webhook: read status updated', watermark });
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

  // Resolve the instagram_account by the recipient's igUserId or facebookPageId
  const account = await prisma.instagramAccount.findFirst({
    where: { 
      OR: [
        { igUserId: recipientIgUserId },
        { facebookPageId: recipientIgUserId }
      ],
      deletedAt: null 
    },
    select: { id: true, organizationId: true, platform: true, facebookPageId: true },
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
  let assignedToId: string | null = null;
  const senderName = senderIgUserId;
  let preview = '';

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
    assignedToId = conversation.assignedToId;
    preview = text ?? '[attachment]';

    // 3. Find or create lead by instagramUserId or facebookUserId
    const lead = await findOrCreateLead(db, senderIgUserId, systemUserId, account.platform as 'INSTAGRAM'|'FACEBOOK', account.facebookPageId ?? undefined);

    // 4. Link lead to conversation if not yet linked
    if (!conversation.leadId && lead) {
      await convRepo.update(conversation.id, { leadId: lead.id });
    }

    // 4b. Execute Simulated Interactive Lead Capture
    if (lead && text) {
      const isSimulation = message['is_simulation'] === true;
      const captureService = new InteractiveCaptureService(db);
      await captureService.handleSimulatedLeadCapture(
        lead,
        conversation.id,
        text,
        account.platform as 'INSTAGRAM' | 'FACEBOOK',
        igAccountId,
        senderIgUserId,
        isSimulation
      );
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

  // 9. Sprint 7 M1 — persist a notification for the assigned agent (DM1-a: only when assigned;
  //    unassigned conversations rely on the org-room emit above + the Unassigned tab).
  //    Post-commit + fire-and-forget — never fails message ingestion.
  if (conversationId && messageId && assignedToId) {
    try {
      const { NotificationService } = await import('../../../modules/notifications/notification.service.js');
      const created = await new NotificationService().notify({
        organizationId: orgId,
        userId: assignedToId,
        type: 'INBOX_MESSAGE',
        title: `New message from ${senderName}`,
        body: preview,
        entityType: 'conversation',
        entityId: conversationId,
        email: { templateKey: 'inbox_message', data: { senderName, preview } },
      });
      if (created) {
        const { notifyOrg } = await import('../../realtime/notification-publisher.js');
        notifyOrg(orgId, 'notification', { id: created.id });
      }
    } catch (err) {
      logger.warn({ message: 'Notification persist failed (non-fatal)', orgId, error: String(err) });
    }
  }
}

async function processMetaComment(
  recipientIgUserId: string,
  value: Record<string, unknown>,
  webhookEventId: string
): Promise<void> {
  const item = value['item'] as string; // 'comment'
  const verb = value['verb'] as string; // 'add'
  if (item !== 'comment' || verb !== 'add') return;

  const senderObj = value['from'] as Record<string, unknown> | undefined;
  const senderIgUserId = senderObj?.['id'] as string | undefined;
  const text = value['message'] as string | undefined;
  const mid = value['comment_id'] as string | undefined || value['id'] as string | undefined;
  const timestamp = Number(value['created_time']) * 1000 || Date.now();

  if (!recipientIgUserId || !senderIgUserId || !text || !mid) return;

  const account = await prisma.instagramAccount.findFirst({
    where: { igUserId: recipientIgUserId, deletedAt: null },
    select: { id: true, organizationId: true, platform: true, facebookPageId: true },
  });

  if (!account) return;

  const orgId = account.organizationId;
  const igAccountId = account.id;

  const systemMember = await prisma.organizationMember.findFirst({
    where: { organizationId: orgId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  });
  const systemUserId = systemMember?.userId;
  if (!systemUserId) return;

  await withTenant(orgId, async (db) => {
    const convRepo = new PrismaConversationRepository(db);
    const msgRepo = new PrismaMessageRepository(db);

    const igConversationId = `${recipientIgUserId}_${senderIgUserId}`;
    const sentAt = new Date(timestamp);

    const conversation = await convRepo.upsertByIgConversationId({
      igConversationId,
      igAccountId,
      lastMessageAt: sentAt,
    });

    const newMsg = await msgRepo.createIfNotExists({
      mid,
      conversationId: conversation.id,
      direction: 'INBOUND',
      contentType: 'TEXT',
      content: { text: `[Comment] ${text}` },
      sentAt,
      senderId: senderIgUserId,
    });

    if (!newMsg) return;

    const lead = await findOrCreateLead(db, senderIgUserId, systemUserId, account.platform as 'INSTAGRAM'|'FACEBOOK', account.facebookPageId ?? undefined);

    if (!conversation.leadId && lead) {
      await convRepo.update(conversation.id, { leadId: lead.id });
    }
    
    // We don't trigger capture flow for comments in this simulation, only DMs.
    
    await convRepo.update(conversation.id, { lastInboundAt: sentAt });
  });

  await prisma.webhookEvent.updateMany({
    where: { id: webhookEventId, organizationId: null },
    data: { organizationId: orgId },
  });
}

/**
 * Find an existing non-deleted lead by instagramUserId, or create one.
 * Catches P2002 (concurrent creation) and re-queries.
 * Per FINAL_ARCHITECTURE_SIGNOFF §5.3.
 */
async function findOrCreateLead(
  db: import('../../tenancy/with-tenant.js').TenantTransactionClient,
  senderId: string,
  systemUserId: string,
  platform: 'INSTAGRAM' | 'FACEBOOK',
  pageId?: string
): Promise<LeadWithCustomFields | null> {
  const isFb = platform === 'FACEBOOK';
  
  const selectFields = {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
    organizationId: true,
    customFields: true,
  };

  // 1. Try to find existing non-deleted lead
  const existing = await db.lead.findFirst({
    where: isFb ? { facebookUserId: senderId, deletedAt: null } : { instagramUserId: senderId, deletedAt: null },
    select: selectFields,
  });
  if (existing) return existing;

  // 2. Create new lead
  try {
    return await db.lead.create({
      data: asTenantCreate<Prisma.LeadUncheckedCreateInput>({
        firstName: isFb ? 'Facebook User' : 'IG User',
        source: isFb ? 'FACEBOOK_DM' : 'INSTAGRAM_DM',
        status: 'NEW',
        instagramUserId: isFb ? null : senderId,
        facebookUserId: isFb ? senderId : null,
        facebookPageId: isFb && pageId ? pageId : null,
        tags: [],
        customFields: {} as Prisma.InputJsonValue,
        createdById: systemUserId,
      }),
      select: selectFields,
    });
  } catch (err) {
    if (isPrismaP2002(err)) {
      // Concurrent create
      return db.lead.findFirst({
        where: isFb ? { facebookUserId: senderId } : { instagramUserId: senderId },
        select: selectFields,
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

// ─── WhatsApp Cloud API receive pipeline ─────────────────────────────────────

async function handleWhatsApp(payload: unknown, webhookEventId: string): Promise<void> {
  const p = payload as Record<string, unknown> | null;
  if (!p || !Array.isArray(p['entry'])) {
    logger.info({ message: 'WhatsApp webhook: no entries', webhookEventId });
    return;
  }

  for (const rawEntry of p['entry'] as unknown[]) {
    const entry = rawEntry as Record<string, unknown>;
    const changes = entry['changes'] as unknown[] | undefined;
    if (!Array.isArray(changes)) continue;

    for (const rawChange of changes) {
      const change = rawChange as Record<string, unknown>;
      const value = change['value'] as Record<string, unknown> | undefined;
      if (!value) continue;

      const messages = value['messages'] as unknown[] | undefined;
      const contacts = value['contacts'] as unknown[] | undefined;
      const metadata = value['metadata'] as Record<string, unknown> | undefined;
      const phoneNumberId = String(metadata?.['phone_number_id'] ?? '');

      if (!Array.isArray(messages) || messages.length === 0) continue;

      // Resolve account by phoneNumberId (cross-tenant lookup via base prisma)
      const waAccount = await prisma.whatsAppAccount.findFirst({
        where: { phoneNumberId, deletedAt: null },
        select: { id: true, organizationId: true },
      });

      if (!waAccount) {
        logger.warn({ message: 'No WhatsApp account for phoneNumberId, skipping', phoneNumberId });
        continue;
      }

      const orgId = waAccount.organizationId;

      // Find system user for lead creation
      const systemMember = await prisma.organizationMember.findFirst({
        where: { organizationId: orgId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
      });
      const systemUserId = systemMember?.userId;

      for (const rawMsg of messages) {
        const msg = rawMsg as Record<string, unknown>;
        const waMessageId = String(msg['id'] ?? '');
        const fromPhone = String(msg['from'] ?? '');
        const msgType = String(msg['type'] ?? 'text');
        const timestampMs = (Number(msg['timestamp'] ?? 0)) * 1000;
        const sentAt = new Date(timestampMs || Date.now());

        if (!waMessageId || !fromPhone) continue;

        // Resolve contact name from contacts array
        const contactEntry = contacts?.find(
          (c) => (c as Record<string, unknown>)['wa_id'] === fromPhone,
        ) as Record<string, unknown> | undefined;
        const senderName = (contactEntry?.['profile'] as Record<string, unknown>)?.['name'] as string | undefined ?? fromPhone;

        let content: Record<string, unknown> = {};
        let contentType = 'TEXT';
        if (msgType === 'text') {
          content = { text: (msg['text'] as Record<string, unknown>)?.['body'] ?? '' };
          contentType = 'TEXT';
        } else if (msgType === 'image') {
          content = { raw: msg['image'] };
          contentType = 'IMAGE';
        } else if (msgType === 'audio') {
          content = { raw: msg['audio'] };
          contentType = 'AUDIO';
        } else if (msgType === 'document') {
          content = { raw: msg['document'] };
          contentType = 'DOCUMENT';
        } else if (msgType === 'template') {
          content = { raw: msg['template'] };
          contentType = 'TEMPLATE';
        } else {
          content = { raw: msg };
          contentType = 'UNKNOWN';
        }

        let conversationId: string | null = null;
        const windowExpiresAt = new Date(sentAt.getTime() + 24 * 60 * 60 * 1000); // +24h

        await withTenant(orgId, async (db) => {
          const {
            PrismaWhatsAppConversationRepository,
            PrismaWhatsAppMessageRepository,
          } = await import('../../../modules/whatsapp/whatsapp.repository.js');

          const convRepo = new PrismaWhatsAppConversationRepository(db);
          const msgRepo = new PrismaWhatsAppMessageRepository(db);

          // Upsert conversation keyed on (account, customerPhone)
          const wabaConversationId = `${waAccount.id}_${fromPhone}`;
          const conv = await convRepo.upsertForOrg(orgId, {
            wabaConversationId,
            accountId: waAccount.id,
            customerPhone: fromPhone,
            lastMessageAt: sentAt,
          });

          // Create message if not duplicate
          const newMsg = await msgRepo.createIfNotExists({
            conversationId: conv.id,
            waMessageId,
            direction: 'INBOUND',
            contentType,
            content: content as import('@prisma/client').Prisma.InputJsonValue,
            sentAt,
          });

          if (!newMsg) {
            logger.debug({ message: 'Duplicate WA message id, skipping', waMessageId });
            return;
          }

          conversationId = conv.id;

          // Update 24h window + lastInboundAt
          await convRepo.update(conv.id, {
            windowExpiresAt,
            lastInboundAt: sentAt,
            lastMessageAt: sentAt,
          });

          // Find or create lead by phone number
          if (systemUserId) {
            const { asTenantCreate } = await import('../../tenancy/tenant-repository.js');
            
            const selectFields = {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
              organizationId: true,
              customFields: true,
            };
            
            let lead: LeadWithCustomFields | null = await db.lead.findFirst({
              where: { phone: fromPhone, deletedAt: null },
              select: selectFields,
            });
            
            if (!lead) {
              try {
                const lastName = senderName.split(' ').slice(1).join(' ');
                lead = await db.lead.create({
                  data: asTenantCreate<import('@prisma/client').Prisma.LeadUncheckedCreateInput>({
                    firstName: senderName.split(' ')[0] ?? fromPhone,
                    ...(lastName ? { lastName } : {}),
                    phone: fromPhone,
                    source: 'WHATSAPP',
                    status: 'NEW',
                    tags: [],
                    customFields: {} as import('@prisma/client').Prisma.InputJsonValue,
                    createdById: systemUserId,
                  }),
                  select: selectFields,
                });
                // Link lead to conversation
                await convRepo.update(conv.id, { leadId: lead.id });
              } catch {
                // P2002 concurrent create — try fetching again
                lead = await db.lead.findFirst({
                  where: { phone: fromPhone, deletedAt: null },
                  select: selectFields,
                });
                if (lead) {
                  await convRepo.update(conv.id, { leadId: lead.id });
                }
              }
            } else {
              if (!conv.leadId) {
                await convRepo.update(conv.id, { leadId: lead.id });
              }
            }
            
            // Execute Simulated Interactive Lead Capture
            if (lead && msgType === 'text') {
              const textContent = (msg['text'] as Record<string, unknown>)?.['body'] as string;
              const isSimulation = msg['is_simulation'] === true;
              if (textContent) {
                const captureService = new InteractiveCaptureService(db);
                await captureService.handleSimulatedLeadCapture(
                  lead,
                  conv.id,
                  textContent,
                  'WHATSAPP',
                  waAccount.id,
                  fromPhone,
                  isSimulation
                );
              }
            }
          }
        });

        // Backfill webhook event org
        await prisma.webhookEvent.updateMany({
          where: { id: webhookEventId, organizationId: null },
          data: { organizationId: orgId },
        });

        // Realtime notification
        if (conversationId) {
          try {
            const { notifyOrg } = await import('../../realtime/notification-publisher.js');
            notifyOrg(orgId, 'whatsapp:message', { conversationId, waMessageId });
          } catch (err) {
            logger.warn({ message: 'WhatsApp realtime notify failed', orgId, error: String(err) });
          }
        }
      }
    }
  }
}

// ─── Stripe / System stubs ────────────────────────────────────────────────────

async function handleStripe(payload: unknown): Promise<void> {
  const p = payload as Record<string, unknown> | null;
  logger.info({ message: 'Stripe webhook received', eventType: p?.['type'], eventId: p?.['id'] });
  if (!p) return;

  const { BillingService } = await import('../../../modules/billing/billing.service.js');
  const service = new BillingService(prisma);
  await service.processStripeEvent(p as unknown as import('stripe').Stripe.Event);
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
