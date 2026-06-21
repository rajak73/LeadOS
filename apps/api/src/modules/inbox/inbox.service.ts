// Inbox service — HTTP-facing read endpoints for conversations and messages.
// All methods require an authenticated tenant context (requireTenantContext).
// Write operations (message creation, send) are added in M4.

import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
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

export class InboxService {
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
