// WhatsApp Send worker — BullMQ processor for the 'whatsapp-send' queue.
//
// Fetches the WhatsApp account credentials (decrypted), calls the Meta Cloud API adapter
// to send the message, and persists a WhatsAppMessage record for audit + inbox display.
// Status is updated to FAILED on adapter errors (logged + re-thrown for BullMQ retry).

import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { logger } from '../../observability/logger.js';
import { withTenant } from '../../tenancy/with-tenant.js';
import { decryptField } from '../../crypto/field-encryption.js';
import { whatsappAdapter, type WaMessageContent } from '../../../modules/whatsapp/whatsapp.adapter.js';
import {
  PrismaWhatsAppAccountRepository,
  PrismaWhatsAppConversationRepository,
  PrismaWhatsAppMessageRepository,
} from '../../../modules/whatsapp/whatsapp.repository.js';

export const WHATSAPP_SEND_JOB = 'whatsapp-send';

export interface WhatsAppSendPayload {
  conversationId: string;
  accountId: string;
  customerPhone: string;
  text?: string;
  templateName?: string;
  templateLanguage?: string;
  orgId: string;
}

export async function processWhatsAppSendJob(job: Job<WhatsAppSendPayload>): Promise<void> {
  const { conversationId, accountId, customerPhone, text, templateName, templateLanguage, orgId } =
    job.data;

  logger.info({ message: 'Processing WhatsApp send job', jobId: job.id, conversationId, accountId });

  await withTenant(orgId, async (db) => {
    const accountRepo = new PrismaWhatsAppAccountRepository(db);
    const convRepo = new PrismaWhatsAppConversationRepository(db);
    const msgRepo = new PrismaWhatsAppMessageRepository(db);

    // Fetch account and decrypt token
    const account = await accountRepo.findByIdOrThrow(accountId);
    const plainToken = decryptField(account.accessToken);

    // Build message content
    let content: WaMessageContent;
    if (templateName) {
      content = {
        type: 'template',
        templateName,
        languageCode: templateLanguage ?? 'en',
      };
    } else if (text) {
      content = { type: 'text', text };
    } else {
      logger.warn({ message: 'WhatsApp send: neither text nor template provided, skipping', jobId: job.id });
      return;
    }

    const sentAt = new Date();
    let waMessageId: string | null = null;
    let sendError: string | null = null;

    try {
      const result = await whatsappAdapter.sendMessage(
        customerPhone,
        content,
        account.phoneNumberId,
        plainToken,
      );
      waMessageId = result.waMessageId;
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err);
      logger.warn({ message: 'WhatsApp send failed', conversationId, error: sendError });
    }

    // Persist message record for inbox display + audit
    const messagePayload: Prisma.InputJsonValue = content.type === 'text'
      ? { text: content.text }
      : { templateName: content.templateName, languageCode: content.languageCode };

    if (waMessageId) {
      await msgRepo.createIfNotExists({
        conversationId,
        waMessageId,
        direction: 'OUTBOUND',
        contentType: content.type === 'template' ? 'TEMPLATE' : 'TEXT',
        content: messagePayload,
        sentAt,
        ...(content.type === 'template' ? { templateName: content.templateName } : {}),
      });

      // Update conversation's lastMessageAt
      await convRepo.update(conversationId, { lastMessageAt: sentAt });

      logger.info({ message: 'WhatsApp message sent', conversationId, waMessageId });
    } else {
      // Send failed — persist a FAILED message record for visibility
      const fallbackMsgId = `failed-${job.id ?? Date.now()}-${Math.random().toString(36).slice(2)}`;
      await msgRepo.createIfNotExists({
        conversationId,
        waMessageId: fallbackMsgId,
        direction: 'OUTBOUND',
        contentType: content.type === 'template' ? 'TEMPLATE' : 'TEXT',
        content: { ...messagePayload, error: sendError } as Prisma.InputJsonValue,
        sentAt,
        ...(content.type === 'template' ? { templateName: content.templateName } : {}),
      });

      // Update message status to FAILED
      await db.whatsAppMessage.updateMany({
        where: { waMessageId: fallbackMsgId },
        data: { status: 'FAILED', errorCode: sendError?.slice(0, 50) ?? 'UNKNOWN' },
      });

      // Re-throw so BullMQ retries
      throw new Error(`WhatsApp send failed: ${sendError}`);
    }
  });
}
