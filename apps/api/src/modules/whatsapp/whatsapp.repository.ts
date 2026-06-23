// WhatsApp module repository — typed Prisma access layer for WhatsApp models.
// All methods accept a TenantTransactionClient scoped inside withTenant().

import type { WhatsAppAccount, WhatsAppTemplate, WhatsAppConversation, WhatsAppMessage, ConversationStatus, Prisma } from '@prisma/client';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { asTenantCreate } from '../../core/tenancy/tenant-repository.js';

// ─── WhatsApp Account Repository ─────────────────────────────────────────────

export interface CreateWhatsAppAccountData {
  wabaId: string;
  phoneNumberId: string;
  displayName: string;
  phoneNumber: string;
  accessToken: string; // AES-256-GCM encrypted by caller
  tokenExpiresAt?: Date;
}

export interface UpdateWhatsAppAccountData {
  status?: 'ACTIVE' | 'DISCONNECTED' | 'EXPIRED';
  accessToken?: string;
  tokenExpiresAt?: Date;
  webhookVerified?: boolean;
  deletedAt?: Date | null;
}

export class PrismaWhatsAppAccountRepository {
  constructor(private readonly db: TenantTransactionClient) {}

  async create(data: CreateWhatsAppAccountData): Promise<WhatsAppAccount> {
    return this.db.whatsAppAccount.create({
      data: asTenantCreate<Prisma.WhatsAppAccountUncheckedCreateInput>(data),
    });
  }

  async findById(id: string): Promise<WhatsAppAccount | null> {
    return this.db.whatsAppAccount.findFirst({ where: { id, deletedAt: null } });
  }

  async findByIdOrThrow(id: string): Promise<WhatsAppAccount> {
    const account = await this.findById(id);
    if (!account) throw new Error(`WhatsAppAccount ${id} not found`);
    return account;
  }

  async findAll(): Promise<WhatsAppAccount[]> {
    return this.db.whatsAppAccount.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(id: string, data: UpdateWhatsAppAccountData): Promise<WhatsAppAccount> {
    return this.db.whatsAppAccount.update({ where: { id }, data });
  }

  async count(): Promise<number> {
    return this.db.whatsAppAccount.count({ where: { deletedAt: null } });
  }

  async isPhoneNumberIdConnected(phoneNumberId: string): Promise<boolean> {
    const existing = await this.db.whatsAppAccount.findFirst({
      where: { phoneNumberId, deletedAt: null },
      select: { id: true },
    });
    return existing !== null;
  }
}

// ─── WhatsApp Template Repository ─────────────────────────────────────────────

export interface UpsertWhatsAppTemplateData {
  accountId: string;
  templateId: string;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  components: Prisma.InputJsonValue;
}

export class PrismaWhatsAppTemplateRepository {
  constructor(private readonly db: TenantTransactionClient) {}

  async upsertForOrg(organizationId: string, data: UpsertWhatsAppTemplateData): Promise<WhatsAppTemplate> {
    return this.db.whatsAppTemplate.upsert({
      where: {
        organizationId_accountId_templateId: {
          organizationId,
          accountId: data.accountId,
          templateId: data.templateId,
        },
      },
      create: { ...data, organizationId },
      update: { name: data.name, status: data.status, components: data.components },
    });
  }

  async findByAccount(accountId: string): Promise<WhatsAppTemplate[]> {
    return this.db.whatsAppTemplate.findMany({
      where: { accountId, status: 'APPROVED' },
      orderBy: { name: 'asc' },
    });
  }

  async findAll(): Promise<WhatsAppTemplate[]> {
    return this.db.whatsAppTemplate.findMany({ orderBy: [{ accountId: 'asc' }, { name: 'asc' }] });
  }
}

// ─── WhatsApp Conversation Repository ────────────────────────────────────────

export interface UpsertWhatsAppConversationData {
  wabaConversationId: string;
  accountId: string;
  customerPhone: string;
  lastMessageAt?: Date;
}

export interface UpdateWhatsAppConversationData {
  leadId?: string | null;
  assignedToId?: string | null;
  status?: ConversationStatus;
  windowExpiresAt?: Date | null;
  lastInboundAt?: Date;
  lastMessageAt?: Date;
}

export class PrismaWhatsAppConversationRepository {
  constructor(private readonly db: TenantTransactionClient) {}

  async upsertForOrg(
    organizationId: string,
    data: UpsertWhatsAppConversationData,
  ): Promise<WhatsAppConversation> {
    const createData: Prisma.WhatsAppConversationUncheckedCreateInput = {
      organizationId,
      wabaConversationId: data.wabaConversationId,
      accountId: data.accountId,
      customerPhone: data.customerPhone,
      ...(data.lastMessageAt !== undefined ? { lastMessageAt: data.lastMessageAt } : {}),
    };

    return this.db.whatsAppConversation.upsert({
      where: {
        organizationId_wabaConversationId: {
          organizationId,
          wabaConversationId: data.wabaConversationId,
        },
      },
      create: createData,
      update: {
        ...(data.lastMessageAt !== undefined ? { lastMessageAt: data.lastMessageAt } : {}),
      },
    });
  }

  async update(id: string, data: UpdateWhatsAppConversationData): Promise<WhatsAppConversation> {
    const updateData: Prisma.WhatsAppConversationUncheckedUpdateInput = {};
    if (data.leadId !== undefined) updateData['leadId'] = data.leadId;
    if (data.assignedToId !== undefined) updateData['assignedToId'] = data.assignedToId;
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.windowExpiresAt !== undefined) updateData['windowExpiresAt'] = data.windowExpiresAt;
    if (data.lastInboundAt !== undefined) updateData['lastInboundAt'] = data.lastInboundAt;
    if (data.lastMessageAt !== undefined) updateData['lastMessageAt'] = data.lastMessageAt;
    return this.db.whatsAppConversation.update({ where: { id }, data: updateData });
  }

  async findById(id: string): Promise<WhatsAppConversation | null> {
    return this.db.whatsAppConversation.findUnique({ where: { id } });
  }
}

// ─── WhatsApp Message Repository ─────────────────────────────────────────────

export interface CreateWhatsAppMessageData {
  conversationId: string;
  waMessageId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  contentType: string;
  content: Prisma.InputJsonValue;
  templateName?: string;
  sentAt: Date;
}

export class PrismaWhatsAppMessageRepository {
  constructor(private readonly db: TenantTransactionClient) {}

  async createIfNotExists(data: CreateWhatsAppMessageData): Promise<WhatsAppMessage | null> {
    const existing = await this.db.whatsAppMessage.findUnique({
      where: { waMessageId: data.waMessageId },
    });
    if (existing) return null;

    // Need to inject organizationId via tenant create helper
    // We resolve it from the conversation
    const conv = await this.db.whatsAppConversation.findUnique({
      where: { id: data.conversationId },
      select: { organizationId: true },
    });
    if (!conv) return null;

    return this.db.whatsAppMessage.create({
      data: asTenantCreate<Prisma.WhatsAppMessageUncheckedCreateInput>({
        conversationId: data.conversationId,
        waMessageId: data.waMessageId,
        direction: data.direction,
        contentType: data.contentType,
        content: data.content,
        ...(data.templateName !== undefined ? { templateName: data.templateName } : {}),
        sentAt: data.sentAt,
      }),
    });
  }

  async updateStatus(
    waMessageId: string,
    status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
    extra?: { deliveredAt?: Date; readAt?: Date; errorCode?: string },
  ): Promise<void> {
    await this.db.whatsAppMessage.updateMany({
      where: { waMessageId },
      data: { status, ...(extra ?? {}) },
    });
  }
}
