// WhatsApp module service — account management, template sync, message sending.
//
// Account storage: access tokens are AES-256-GCM encrypted before writing to DB.
// 24-hour window: enforced on text sends; template sends bypass the window.
// Plan limits: enforced against PLAN_LIMITS[plan].whatsappAccounts before account creation.
// All methods require an authenticated tenant context (requireTenantContext).

import type { WhatsAppAccount, WhatsAppTemplate, Prisma } from '@prisma/client';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { encryptField, decryptField } from '../../core/crypto/field-encryption.js';
import { enqueue } from '../../core/queue/queues.js';
import { QUEUE } from '../../core/queue/names.js';
import { logger } from '../../core/observability/logger.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';
import { env } from '../../core/config/env.js';
import { whatsappAdapter } from './whatsapp.adapter.js';
import {
  PrismaWhatsAppAccountRepository,
  PrismaWhatsAppTemplateRepository,
  PrismaWhatsAppConversationRepository,
} from './whatsapp.repository.js';


// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectWhatsAppAccountInput {
  wabaId: string;
  phoneNumberId: string;
  displayName: string;
  phoneNumber: string;
  accessToken: string; // plain text — encrypted before storage
}

export interface SendWhatsAppMessageInput {
  conversationId: string;
  text?: string;
  templateName?: string;
  templateLanguage?: string;
  accountId: string;
}

export interface SendWhatsAppMessageResult {
  waMessageId: string;
  status: 'SENT';
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class WhatsAppService {
  /**
   * Connect a WABA account to the tenant organization.
   * Encrypts the access token and syncs templates from Meta.
   * Enforces plan limits on whatsappAccounts count.
   */
  async connectAccount(input: ConnectWhatsAppAccountInput): Promise<WhatsAppAccount> {
    const ctx = requireTenantContext();
    const orgId = ctx.organizationId;

    return withTenant(orgId, async (db) => {
      const accountRepo = new PrismaWhatsAppAccountRepository(db);

      // Duplicate check — same phoneNumberId already connected
      const alreadyConnected = await accountRepo.isPhoneNumberIdConnected(input.phoneNumberId);
      if (alreadyConnected) {
        throw new AppError(ErrorCode.CONFLICT, 'This WhatsApp phone number is already connected');
      }

      // Plan limit check (WhatsApp accounts cap)
      const sub = await db.subscription.findFirst({ select: { plan: true } });
      const plan = (sub?.plan ?? 'TRIAL') as string;
      // We allow up to 1 WhatsApp account for TRIAL/STARTER, 3 for GROWTH, unlimited for ENTERPRISE
      const planLimits: Record<string, number> = {
        TRIAL: 1,
        STARTER: 1,
        GROWTH: 3,
        SCALE: 5,
        ENTERPRISE: 999,
      };
      const limit = planLimits[plan] ?? 1;
      const currentCount = await accountRepo.count();
      if (currentCount >= limit) {
        throw new AppError(
          ErrorCode.PLAN_LIMIT_EXCEEDED,
          `Plan limit reached: ${currentCount}/${limit} WhatsApp accounts`,
        );
      }

      const encryptedToken = encryptField(input.accessToken);
      const account = await accountRepo.create({
        wabaId: input.wabaId,
        phoneNumberId: input.phoneNumberId,
        displayName: input.displayName,
        phoneNumber: input.phoneNumber,
        accessToken: encryptedToken,
      });

      // Sync templates in the background (non-fatal if Meta is unavailable)
      try {
        await this._syncTemplatesForAccount(db, orgId, account.id, input.wabaId, input.accessToken);
      } catch (err) {
        logger.warn({
          message: 'WhatsApp template sync failed on connect (non-fatal)',
          accountId: account.id,
          error: String(err),
        });
      }

      logger.info({ message: 'WhatsApp account connected', orgId, accountId: account.id, phoneNumberId: input.phoneNumberId });
      return account;
    });
  }

  /** List connected (non-deleted) WhatsApp accounts for the current tenant. */
  async listAccounts(): Promise<WhatsAppAccount[]> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaWhatsAppAccountRepository(db);
      return repo.findAll();
    });
  }

  /** Disconnect an account: soft-delete it. */
  async disconnectAccount(id: string): Promise<void> {
    const ctx = requireTenantContext();
    await withTenant(ctx.organizationId, async (db) => {
      const repo = new PrismaWhatsAppAccountRepository(db);
      await repo.findByIdOrThrow(id); // throws if not found in this org
      await repo.update(id, { status: 'DISCONNECTED', deletedAt: new Date() });
      logger.info({ message: 'WhatsApp account disconnected', orgId: ctx.organizationId, accountId: id });
    });
  }

  /**
   * Sync approved templates from Meta into local DB.
   * Returns the number of templates upserted.
   */
  async syncTemplates(accountId: string): Promise<number> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const accountRepo = new PrismaWhatsAppAccountRepository(db);
      const account = await accountRepo.findByIdOrThrow(accountId);
      const plainToken = decryptField(account.accessToken);

      return this._syncTemplatesForAccount(db, ctx.organizationId, account.id, account.wabaId, plainToken);
    });
  }

  /** List approved templates for an account. */
  async getTemplates(accountId: string): Promise<WhatsAppTemplate[]> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const templateRepo = new PrismaWhatsAppTemplateRepository(db);
      return templateRepo.findByAccount(accountId);
    });
  }

  /**
   * Send an outbound WhatsApp message.
   * Free-form text messages require the 24h window to be open.
   * Template messages bypass the window restriction.
   */
  async sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
    if (!env.FLAG_WHATSAPP_SENDS_ENABLED) {
      throw new AppError(ErrorCode.FEATURE_DISABLED, 'WhatsApp sends are currently disabled');
    }

    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      // Resolve conversation and validate 24h window for text messages
      const convRepo = new PrismaWhatsAppConversationRepository(db);
      const conv = await convRepo.findById(input.conversationId);
      if (!conv) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Conversation not found');
      }

      const isTextMessage = !input.templateName;
      if (isTextMessage) {
        const windowOpen =
          conv.windowExpiresAt !== null && conv.windowExpiresAt > new Date();
        if (!windowOpen) {
          throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            'Cannot send free-form message: 24-hour messaging window is closed. Use a template instead.',
          );
        }
      }

      // Enqueue outbound send (rate-limited via BullMQ)
      const jobPayload = {
        conversationId: input.conversationId,
        accountId: input.accountId,
        customerPhone: conv.customerPhone,
        text: input.text,
        templateName: input.templateName,
        templateLanguage: input.templateLanguage ?? 'en',
        orgId: ctx.organizationId,
      };

      const jobId = await enqueue(QUEUE.WHATSAPP_SEND, 'whatsapp-send', jobPayload);
      const pseudoMsgId = `pending-${jobId ?? Date.now()}`;

      logger.info({
        message: 'WhatsApp send enqueued',
        conversationId: input.conversationId,
        accountId: input.accountId,
        isTemplate: !isTextMessage,
      });

      return { waMessageId: pseudoMsgId, status: 'SENT' };
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async _syncTemplatesForAccount(
    db: import('../../core/tenancy/with-tenant.js').TenantTransactionClient,
    organizationId: string,
    accountId: string,
    wabaId: string,
    plainAccessToken: string,
  ): Promise<number> {
    const rawTemplates = await whatsappAdapter.getTemplates(wabaId, plainAccessToken);
    const templateRepo = new PrismaWhatsAppTemplateRepository(db);
    let count = 0;

    const categoryMap: Record<string, 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'> = {
      MARKETING: 'MARKETING',
      UTILITY: 'UTILITY',
      AUTHENTICATION: 'AUTHENTICATION',
    };
    const statusMap: Record<string, 'APPROVED' | 'PENDING' | 'REJECTED'> = {
      APPROVED: 'APPROVED',
      PENDING: 'PENDING',
      REJECTED: 'REJECTED',
    };

    for (const tpl of rawTemplates) {
      await templateRepo.upsertForOrg(organizationId, {
        accountId,
        templateId: tpl.id,
        name: tpl.name,
        language: tpl.language,
        category: categoryMap[tpl.category.toUpperCase()] ?? 'UTILITY',
        status: statusMap[tpl.status.toUpperCase()] ?? 'PENDING',
        components: tpl.components as Prisma.InputJsonValue,
      });
      count++;
    }

    logger.info({ message: 'WhatsApp templates synced', accountId, count });
    return count;
  }
}
