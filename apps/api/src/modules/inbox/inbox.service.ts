// Inbox service — HTTP-facing read and write endpoints for conversations and messages.
// All methods require an authenticated tenant context (requireTenantContext).

import crypto from 'crypto';
import { logger } from '../../core/observability/logger.js';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { enqueue } from '../../core/queue/queues.js';
import { QUEUE } from '../../core/queue/names.js';
import { INSTAGRAM_SEND_JOB } from '../../core/queue/workers/instagram-send.worker.js';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';
import {
  PrismaConversationRepository,
  PrismaMessageRepository,
  PrismaSavedReplyRepository,
  type ConversationListQuery,
  type ConversationWithRelations,
  type MessageListQuery,
  type CreateSavedReplyData,
  type UpdateSavedReplyData,
} from './inbox.repository.js';
import type { Message, SavedReply } from '@prisma/client';
import { PrismaLeadRepository } from '../leads/lead.repository.js';

export interface ConversationPage {
  items: ConversationWithRelations[];
  nextCursor: string | null;
}

export interface MessagePage {
  items: Message[];
  nextCursor: string | null;
}

const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SendMessageResult {
  messageId: string;
  status: 'SENT';
}

export class InboxService {
  async sendMessage(
    conversationId: string,
    content: { text: string },
    senderId: string,
  ): Promise<SendMessageResult> {
    if (!env.FLAG_INSTAGRAM_SENDS_ENABLED) {
      throw new AppError(ErrorCode.FEATURE_DISABLED, 'Instagram sends are currently disabled');
    }

    const ctx = requireTenantContext();

    return withTenant(ctx.organizationId, async (db) => {
      const convRepo = new PrismaConversationRepository(db);
      const msgRepo = new PrismaMessageRepository(db);

      const conv = await convRepo.findByIdOrThrow(conversationId);

      if (ctx.ownOnly && conv.assignedToId !== ctx.userId) {
        throw new AppError(ErrorCode.FORBIDDEN, 'Access denied: conversation not assigned to you');
      }

      // 24-hour messaging window check
      if (!conv.lastInboundAt || Date.now() - conv.lastInboundAt.getTime() > MESSAGING_WINDOW_MS) {
        throw new AppError(ErrorCode.WINDOW_CLOSED, 'Messaging window has expired — customer must send a new message to reopen');
      }

      // Derive recipient's IG user ID from the stable igConversationId key
      // Format: ${recipientIgUserId}_${senderIgUserId}
      const parts = conv.igConversationId.split('_');
      const recipientIgUserId = parts[0]!;
      const senderIgUserId = parts.slice(1).join('_');

      // Create message row optimistically (status=SENT; worker updates mid after Meta confirms)
      const tempMid = `local_${crypto.randomUUID()}`;
      const msg = await msgRepo.createIfNotExists({
        mid: tempMid,
        conversationId,
        direction: 'OUTBOUND',
        contentType: 'TEXT',
        content: { text: content.text },
        sentAt: new Date(),
        senderId,
      });

      if (!msg) {
        // Collision on temp mid (astronomically unlikely) — safe to throw
        throw new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to create message: mid collision');
      }

      // SLA: stamp firstResponseAt on the first outbound message per conversation
      if (!conv.firstResponseAt) {
        await convRepo.update(conversationId, { firstResponseAt: new Date() });
      }

      // Enqueue send job — worker handles Meta API call + status update
      await enqueue(QUEUE.INSTAGRAM_SEND, INSTAGRAM_SEND_JOB, {
        organizationId: ctx.organizationId,
        conversationId,
        messageId: msg.id,
        recipientIgUserId: senderIgUserId, // send TO the customer (swap roles for reply)
        content: { text: content.text },
        igAccountId: conv.igAccountId,
      });

      logger.debug({
        message: 'instagram send enqueued',
        conversationId, messageId: msg.id, recipientIgUserId, senderIgUserId,
      });

      return { messageId: msg.id, status: 'SENT' };
    });
  }

  async listConversations(query: ConversationListQuery): Promise<ConversationPage> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaConversationRepository(db);
      // inbox.read_own: only return conversations assigned to the caller
      const effectiveQuery: ConversationListQuery = ctx.ownOnly
        ? { ...query, ownOnly: true, userId: ctx.userId }
        : query;
      return repo.list(effectiveQuery);
    });
  }

  async getConversation(id: string): Promise<ConversationWithRelations> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaConversationRepository(db);
      const conv = await repo.findByIdOrThrow(id);
      // inbox.read_own: caller may only read their own conversations
      if (ctx.ownOnly && conv.assignedToId !== ctx.userId) {
        const { AppError } = await import('../../core/errors/app-error.js');
        const { ErrorCode } = await import('@leados/shared');
        throw new AppError(ErrorCode.FORBIDDEN, 'Access denied: conversation not assigned to you');
      }
      return conv;
    });
  }

  async updateConversation(
    id: string,
    patch: { assignedToId?: string | null; status?: 'OPEN' | 'CLOSED' },
  ): Promise<ConversationWithRelations> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaConversationRepository(db);
      await repo.findByIdOrThrow(id); // confirms conversation belongs to this org
      await repo.update(id, patch);
      return repo.findByIdOrThrow(id);
    });
  }

  async listMessages(conversationId: string, query: MessageListQuery): Promise<MessagePage> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      // Verify conversation exists and is accessible (ownOnly check)
      const convRepo = new PrismaConversationRepository(db);
      const conv = await convRepo.findByIdOrThrow(conversationId);
      if (ctx.ownOnly && conv.assignedToId !== ctx.userId) {
        const { AppError } = await import('../../core/errors/app-error.js');
        const { ErrorCode } = await import('@leados/shared');
        throw new AppError(ErrorCode.FORBIDDEN, 'Access denied: conversation not assigned to you');
      }
      const msgRepo = new PrismaMessageRepository(db);
      return msgRepo.listByConversation(conversationId, query);
    });
  }

  // ─── Saved Replies ──────────────────────────────────────────────────────────

  async listSavedReplies(q?: string): Promise<SavedReply[]> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      return new PrismaSavedReplyRepository(db).list(q);
    });
  }

  async createSavedReply(data: Omit<CreateSavedReplyData, 'createdById'>): Promise<SavedReply> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      return new PrismaSavedReplyRepository(db).create({ ...data, createdById: ctx.userId });
    });
  }

  async updateSavedReply(id: string, data: UpdateSavedReplyData): Promise<SavedReply> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaSavedReplyRepository(db);
      await repo.findByIdOrThrow(id); // confirms it belongs to this org and exists
      return repo.update(id, data);
    });
  }

  async deleteSavedReply(id: string): Promise<void> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaSavedReplyRepository(db);
      await repo.findByIdOrThrow(id);
      await repo.softDelete(id);
    });
  }

  // ─── Create Lead from Conversation (R-1, R-5 corrections applied) ──────────

  async createLeadFromConversation(
    conversationId: string,
    data: { firstName: string; lastName?: string },
  ): Promise<import('@prisma/client').Lead> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const convRepo = new PrismaConversationRepository(db);
      const conv = await convRepo.findByIdOrThrow(conversationId);

      // Reject if conversation is already linked to a lead (R-1 correction)
      if (conv.leadId) {
        throw new AppError(ErrorCode.CONFLICT, 'This conversation is already linked to a lead');
      }

      // Parse customer IG user ID from igConversationId: format is "${recipientId}_${senderId}"
      const parts = conv.igConversationId.split('_');
      const customerIgUserId = parts.slice(1).join('_');
      if (!customerIgUserId) {
        throw new AppError(ErrorCode.INTERNAL_ERROR, 'Unable to derive customer IG user ID from conversation');
      }

      // Check for existing lead with this Instagram user ID (R-1: unique constraint guard)
      const leadRepo = new PrismaLeadRepository(db);
      const existing = await db.lead.findFirst({
        where: { instagramUserId: customerIgUserId, deletedAt: null },
      });
      if (existing) {
        throw new AppError(ErrorCode.CONFLICT, 'A lead for this Instagram account already exists');
      }

      // Create the lead — instagramHandle from enriched lead data if available, else null
      const instagramHandle = conv.lead?.instagramHandle ?? null;
      const newLead = await leadRepo.create({
        firstName: data.firstName,
        lastName: data.lastName ?? null,
        source: 'INSTAGRAM_DM',
        status: 'NEW',
        instagramUserId: customerIgUserId,
        instagramHandle,
        tags: [],
        createdById: ctx.userId,
      });

      // Link conversation to the new lead (R-5: direct repo call, not updateConversation)
      await convRepo.update(conversationId, { leadId: newLead.id });

      logger.debug({ message: 'lead created from conversation', conversationId, leadId: newLead.id });
      return newLead;
    });
  }
}
