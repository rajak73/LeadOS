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
  type ConversationListQuery,
  type ConversationWithRelations,
  type MessageListQuery,
} from './inbox.repository.js';
import type { Message } from '@prisma/client';

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
}
