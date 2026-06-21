// Inbox repositories — conversation and message data access.
// All classes extend TenantRepository and must be used inside withTenant().
// organizationId is injected by the tenant extension; callers never supply it.

import type { InstagramConversation, Message, SavedReply, Prisma } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import { currentTenantOrganizationId } from '../../core/tenancy/scope.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

// ─── Conversation types ───────────────────────────────────────────────────────

export interface UpsertConversationData {
  igConversationId: string;
  igAccountId: string;
  lastMessageAt: Date;
}

export interface UpdateConversationData {
  leadId?: string | null;
  assignedToId?: string | null;
  status?: 'OPEN' | 'CLOSED';
  firstResponseAt?: Date | null;
  lastInboundAt?: Date | null;
  lastMessageAt?: Date | null;
}

export interface ConversationListQuery {
  accountId?: string;
  assignedToId?: string;
  status?: 'OPEN' | 'CLOSED';
  ownOnly?: boolean;
  userId?: string;
  cursor?: string; // ISO date string of lastMessageAt for cursor pagination
  cursorId?: string; // id of the conversation at the cursor
  limit?: number;
}

export type ConversationWithRelations = InstagramConversation & {
  igAccount: { id: string; igUsername: string | null; profilePictureUrl: string | null };
  lead: { id: string; firstName: string; lastName: string | null; instagramHandle: string | null } | null;
  assignedTo: { id: string; firstName: string; lastName: string | null } | null;
};

// ─── Message types ────────────────────────────────────────────────────────────

export interface CreateMessageData {
  mid: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  contentType: string;
  content: Record<string, unknown>;
  sentAt: Date;
  senderId?: string;
}

export interface MessageListQuery {
  cursor?: string; // ISO date string of sentAt
  cursorId?: string;
  limit?: number;
}

// ─── PrismaConversationRepository ────────────────────────────────────────────

export class PrismaConversationRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  /**
   * Upsert a conversation by (organizationId, igConversationId).
   * On conflict updates lastMessageAt. Returns the row in both cases.
   */
  async upsertByIgConversationId(data: UpsertConversationData): Promise<InstagramConversation> {
    const organizationId = currentTenantOrganizationId()!;
    return this.db.instagramConversation.upsert({
      where: {
        organizationId_igConversationId: { organizationId, igConversationId: data.igConversationId },
      },
      create: asTenantCreate<Prisma.InstagramConversationUncheckedCreateInput>({
        igConversationId: data.igConversationId,
        igAccountId: data.igAccountId,
        status: 'OPEN',
        labels: [],
        lastMessageAt: data.lastMessageAt,
      }),
      update: { lastMessageAt: data.lastMessageAt },
    });
  }

  async findById(id: string): Promise<ConversationWithRelations | null> {
    return this.db.instagramConversation.findFirst({
      where: { id },
      include: {
        igAccount: { select: { id: true, igUsername: true, profilePictureUrl: true } },
        lead: { select: { id: true, firstName: true, lastName: true, instagramHandle: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    }) as Promise<ConversationWithRelations | null>;
  }

  async findByIdOrThrow(id: string): Promise<ConversationWithRelations> {
    const conv = await this.findById(id);
    if (!conv) throw new AppError(ErrorCode.NOT_FOUND, `Conversation ${id} not found`);
    return conv;
  }

  async list(query: ConversationListQuery): Promise<{ items: ConversationWithRelations[]; nextCursor: string | null }> {
    const limit = Math.min(query.limit ?? 20, 50);
    const where: Prisma.InstagramConversationWhereInput = {};

    if (query.accountId) where.igAccountId = query.accountId;
    if (query.status) where.status = query.status;

    if (query.ownOnly && query.userId) {
      where.assignedToId = query.userId;
    } else if (query.assignedToId) {
      where.assignedToId = query.assignedToId;
    }

    // Cursor: lastMessageAt DESC, then id ASC for stability
    if (query.cursor && query.cursorId) {
      where.OR = [
        { lastMessageAt: { lt: new Date(query.cursor) } },
        { lastMessageAt: new Date(query.cursor), id: { gt: query.cursorId } },
      ];
    }

    const items = await this.db.instagramConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      include: {
        igAccount: { select: { id: true, igUsername: true, profilePictureUrl: true } },
        lead: { select: { id: true, firstName: true, lastName: true, instagramHandle: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    }) as ConversationWithRelations[];

    const hasNext = items.length > limit;
    if (hasNext) items.pop();

    const lastItem = items[items.length - 1];
    const nextCursor =
      hasNext && lastItem
        ? JSON.stringify({ at: lastItem.lastMessageAt?.toISOString() ?? null, id: lastItem.id })
        : null;

    return { items, nextCursor };
  }

  async update(id: string, data: UpdateConversationData): Promise<InstagramConversation> {
    return this.db.instagramConversation.update({ where: { id }, data });
  }
}

// ─── PrismaMessageRepository ──────────────────────────────────────────────────

export class PrismaMessageRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  /**
   * Insert a new message. Returns null if the mid already exists (idempotent dedup).
   * The `mid` unique constraint (on the messages table) is the dedup guard.
   */
  async createIfNotExists(data: CreateMessageData): Promise<Message | null> {
    try {
      return await this.db.message.create({
        data: asTenantCreate<Prisma.MessageUncheckedCreateInput>({
          mid: data.mid,
          conversationId: data.conversationId,
          direction: data.direction,
          contentType: data.contentType,
          content: data.content as Prisma.InputJsonValue,
          status: 'SENT',
          sentAt: data.sentAt,
          ...(data.senderId !== undefined ? { senderId: data.senderId } : {}),
        }),
      });
    } catch (err) {
      if (isPrismaUniqueError(err)) return null; // mid already exists
      throw err;
    }
  }

  async listByConversation(
    conversationId: string,
    query: MessageListQuery,
  ): Promise<{ items: Message[]; nextCursor: string | null }> {
    const limit = Math.min(query.limit ?? 50, 100);
    const where: Prisma.MessageWhereInput = { conversationId };

    // Cursor: sentAt DESC, then id ASC for stability
    if (query.cursor && query.cursorId) {
      where.OR = [
        { sentAt: { lt: new Date(query.cursor) } },
        { sentAt: new Date(query.cursor), id: { gt: query.cursorId } },
      ];
    }

    const items = await this.db.message.findMany({
      where,
      orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasNext = items.length > limit;
    if (hasNext) items.pop();

    const lastItem = items[items.length - 1];
    const nextCursor =
      hasNext && lastItem
        ? JSON.stringify({ at: lastItem.sentAt.toISOString(), id: lastItem.id })
        : null;

    return { items, nextCursor };
  }
}

// ─── SavedReply types ──────────────────────────────────────────────────────────

export interface CreateSavedReplyData {
  title: string;
  content: string;
  shortcut?: string;
  isGlobal?: boolean;
  createdById: string;
}

export interface UpdateSavedReplyData {
  title?: string;
  content?: string;
  shortcut?: string | null;
  isGlobal?: boolean;
}

// ─── PrismaSavedReplyRepository ───────────────────────────────────────────────

export class PrismaSavedReplyRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async list(q?: string): Promise<SavedReply[]> {
    return this.db.savedReply.findMany({
      where: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { shortcut: { contains: q, mode: 'insensitive' } },
                { title: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ title: 'asc' }],
    });
  }

  async findById(id: string): Promise<SavedReply | null> {
    return this.db.savedReply.findFirst({ where: { id, deletedAt: null } });
  }

  async findByIdOrThrow(id: string): Promise<SavedReply> {
    const reply = await this.findById(id);
    if (!reply) throw new AppError(ErrorCode.NOT_FOUND, `SavedReply ${id} not found`);
    return reply;
  }

  async create(data: CreateSavedReplyData): Promise<SavedReply> {
    return this.db.savedReply.create({
      data: asTenantCreate({
        title: data.title,
        content: data.content,
        shortcut: data.shortcut ?? null,
        isGlobal: data.isGlobal ?? true,
        createdById: data.createdById,
      }),
    });
  }

  async update(id: string, data: UpdateSavedReplyData): Promise<SavedReply> {
    return this.db.savedReply.update({ where: { id }, data });
  }

  async softDelete(id: string): Promise<void> {
    await this.db.savedReply.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
