import type { Prisma } from '@prisma/client';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import { logger } from '../../core/observability/logger.js';
import { enqueue } from '../../core/queue/queues.js';
import { QUEUE } from '../../core/queue/names.js';
import { INSTAGRAM_SEND_JOB } from '../../core/queue/workers/instagram-send.worker.js';
import { WHATSAPP_SEND_JOB } from '../../core/queue/workers/whatsapp-send.worker.js';
import { PrismaMessageRepository } from './inbox.repository.js';

export interface LeadWithCustomFields {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  organizationId: string;
  customFields: Prisma.JsonValue;
}

const CAPTURE_STATE_KEY = 'captureState';
const STATE_NEEDS_NAME_PHONE = 'NEEDS_NAME_PHONE';

export class InteractiveCaptureService {
  constructor(private readonly db: TenantTransactionClient) {}

  async handleSimulatedLeadCapture(
    lead: LeadWithCustomFields,
    conversationId: string,
    messageText: string,
    platform: 'INSTAGRAM' | 'FACEBOOK' | 'WHATSAPP',
    accountId: string,
    recipientUserId: string, // sender from our perspective
    isSimulation: boolean = false
  ): Promise<void> {
    const customFields = (lead.customFields as Record<string, unknown>) || {};
    const currentState = customFields[CAPTURE_STATE_KEY] as string | undefined;

    // Case A: New sender has no name/phone (and not currently in a state)
    if (!currentState && this.shouldAskForContactDetails(lead)) {
      logger.info({ message: 'Interactive Capture: Starting capture flow', leadId: lead.id });
      await this.setCaptureState(lead.id, customFields, STATE_NEEDS_NAME_PHONE);
      await this.sendCaptureReply(conversationId, lead.organizationId, platform, accountId, recipientUserId,
        "Thanks for reaching out. Please share your name and phone number so our team can help you faster.",
        isSimulation
      );
      return;
    }

    // Case B & C: Currently in capture state
    if (currentState === STATE_NEEDS_NAME_PHONE) {
      const parsed = this.parseContactDetailsFromText(messageText);
      const isPhoneUpdated = parsed.phone && !lead.phone;
      const isNameUpdated = parsed.name && (!lead.firstName || lead.firstName === 'IG User' || lead.firstName === 'Facebook User' || lead.firstName === lead.phone);

      if (!isPhoneUpdated && !isNameUpdated) {
        // Did not find anything useful, but maybe they just said something else. Do not spam.
        // We'll just leave it in NEEDS_NAME_PHONE for now, but not auto-reply again.
        return;
      }

      // Update lead
      await this.updateLeadContactDetails(lead.id, parsed.name, parsed.phone);

      // Add Activity
      await this.db.activity.create({
        data: {
          organizationId: lead.organizationId,
          relatedLeadId: lead.id,
          type: 'NOTE_ADDED',
          description: `Captured from social message: ${messageText}`,
          performedById: (await this.getSystemUserId(lead.organizationId)) ?? '',
        }
      });

      // Clear state
      if (parsed.phone || lead.phone) {
        // We have phone now, clear state.
        await this.clearCaptureState(lead.id, customFields);
        await this.sendCaptureReply(conversationId, lead.organizationId, platform, accountId, recipientUserId,
          `Thanks ${parsed.name || lead.firstName}. Our team will contact you shortly.`,
          isSimulation
        );
      } else {
        // Case C: Got name but no phone
        await this.sendCaptureReply(conversationId, lead.organizationId, platform, accountId, recipientUserId,
          `Thanks ${parsed.name || lead.firstName}. Please also share your phone number so our team can contact you.`,
          isSimulation
        );
      }
    }
    // Case D: Existing lead already has phone. Do nothing.
  }

  private shouldAskForContactDetails(lead: LeadWithCustomFields): boolean {
    // If we already have a valid phone, we don't need to ask.
    if (lead.phone && lead.phone.length >= 10) return false;
    return true;
  }

  private parseContactDetailsFromText(text: string): { name?: string; phone?: string } {
    const result: { name?: string; phone?: string } = {};

    // Match Indian style 10 digit numbers, optionally with +91
    const phoneRegex = /(?:\+91[\s-]?)?[6-9]\d{9}/;
    const phoneMatch = text.match(phoneRegex);
    if (phoneMatch) {
      // normalize to strip spaces/dashes
      result.phone = phoneMatch[0].replace(/[\s-]/g, '');
    }

    // Heuristics for name
    const lowerText = text.toLowerCase();
    const nameMatch = lowerText.match(/(?:my name is|i am|i'm)\s+([a-z]+(?:\s+[a-z]+)?)/i);
    if (nameMatch && nameMatch[1]) {
      const rawName = nameMatch[1].trim();
      // capitalize first letter
      result.name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    }

    return result;
  }

  private async setCaptureState(leadId: string, currentFields: Record<string, unknown>, state: string): Promise<void> {
    const newFields = { ...currentFields, [CAPTURE_STATE_KEY]: state };
    await this.db.lead.update({
      where: { id: leadId },
      data: { customFields: newFields as Prisma.InputJsonValue }
    });
  }

  private async clearCaptureState(leadId: string, currentFields: Record<string, unknown>): Promise<void> {
    const newFields = { ...currentFields };
    delete newFields[CAPTURE_STATE_KEY];
    await this.db.lead.update({
      where: { id: leadId },
      data: { customFields: newFields as Prisma.InputJsonValue }
    });
  }

  private async updateLeadContactDetails(leadId: string, name?: string, phone?: string): Promise<void> {
    const data: Record<string, string> = {};
    if (name) {
      const parts = name.split(' ');
      if (parts[0]) {
        data.firstName = parts[0];
      }
      if (parts.length > 1) {
        data.lastName = parts.slice(1).join(' ');
      }
    }
    if (typeof phone === 'string' && phone.length > 0) {
      data.phone = phone;
    }

    if (Object.keys(data).length > 0) {
      await this.db.lead.update({
        where: { id: leadId },
        data
      });
    }
  }

  private async getSystemUserId(orgId: string): Promise<string | null> {
    const member = await this.db.organizationMember.findFirst({
      where: { organizationId: orgId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    return member?.userId ?? null;
  }

  private async sendCaptureReply(
    conversationId: string,
    organizationId: string,
    platform: 'INSTAGRAM' | 'FACEBOOK' | 'WHATSAPP',
    accountId: string,
    recipientUserId: string,
    text: string,
    isSimulation: boolean
  ): Promise<void> {
    const msgRepo = new PrismaMessageRepository(this.db);
    // Create outbound message row
    const newMsg = await msgRepo.createIfNotExists({
      mid: `local_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      conversationId,
      direction: 'OUTBOUND',
      contentType: 'TEXT',
      content: { text },
      sentAt: new Date(),
    });

    if (!newMsg) return;

    if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') {
      await enqueue(QUEUE.INSTAGRAM_SEND, INSTAGRAM_SEND_JOB, {
        organizationId,
        conversationId,
        messageId: newMsg.id,
        recipientIgUserId: recipientUserId,
        content: { text },
        igAccountId: accountId,
        isSimulation,
      });
    } else if (platform === 'WHATSAPP') {
      await enqueue(QUEUE.WHATSAPP_SEND, WHATSAPP_SEND_JOB, {
        organizationId,
        conversationId,
        messageId: newMsg.id,
        toPhone: recipientUserId, // For WA, recipientUserId is the phone number
        content: { type: 'text', text },
        accountId, // For WA, this is the whatsAppAccount id
        isSimulation,
      });
    }
  }
}
