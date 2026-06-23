import { type WorkflowAction } from '@leados/shared';
import { enqueue } from '../../core/queue/queues.js';
import { QUEUE } from '../../core/queue/names.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';
import crypto from 'crypto';
import dns from 'node:dns/promises';
import net from 'node:net';

/** Maximum nesting depth for workflow runs to prevent infinite loops. */
export const MAX_WORKFLOW_DEPTH = 10;

// ─── SSRF Guard ──────────────────────────────────────────────────────────────

const PRIVATE_CIDRS = [
  // loopback
  { start: '127.0.0.0', end: '127.255.255.255' },
  // RFC-1918 private ranges
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  // link-local
  { start: '169.254.0.0', end: '169.254.255.255' },
  // multicast
  { start: '224.0.0.0', end: '239.255.255.255' },
  // reserved
  { start: '240.0.0.0', end: '255.255.255.255' },
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function isPrivateIp(ip: string): boolean {
  if (!net.isIPv4(ip)) return true; // block IPv6 in SSRF guard (simplified)
  const intIp = ipToInt(ip);
  return PRIVATE_CIDRS.some(
    ({ start, end }) => intIp >= ipToInt(start) && intIp <= ipToInt(end),
  );
}

async function assertPublicUrl(urlStr: string): Promise<void> {
  let hostname: string;
  try {
    hostname = new URL(urlStr).hostname;
  } catch {
    throw new Error(`Invalid webhook URL: ${urlStr}`);
  }

  // Resolve all addresses and reject if any are private
  let addresses: string[] = [];
  try {
    const results = await dns.lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new Error(`Cannot resolve webhook hostname: ${hostname}`);
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error(`SSRF blocked: webhook URL resolves to private IP (${addr})`);
    }
  }
}

// ─── Action Executor ─────────────────────────────────────────────────────────

export async function executeAction(
  db: TenantTransactionClient,
  organizationId: string,
  action: WorkflowAction,
  entity: { id: string; firstName?: string; assignedToId?: string | null; customFields?: unknown; [key: string]: unknown },
  actorId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    switch (action.type) {
      case 'update_lead_status': {
        const leadId = entity.id;
        if (!entity.firstName) {
          return { success: false, error: 'Entity is not a lead or has no status field' };
        }
        await db.lead.update({
          where: { id: leadId },
          data: { status: action.config.status }
        });
        return { success: true, message: `Updated lead status to ${action.config.status}` };
      }

      case 'assign_lead': {
        const leadId = entity.id;
        if (!entity.firstName) {
          return { success: false, error: 'Entity is not a lead' };
        }
        await db.lead.update({
          where: { id: leadId },
          data: { assignedToId: action.config.userId }
        });
        return { success: true, message: `Assigned lead to user ${action.config.userId}` };
      }

      case 'add_tag': {
        const leadId = entity.id;
        if (!entity.firstName) {
          return { success: false, error: 'Entity is not a lead' };
        }
        const lead = await db.lead.findUnique({ where: { id: leadId } });
        if (!lead) return { success: false, error: 'Lead not found' };
        const tags = Array.from(new Set([...(lead.tags || []), action.config.tag]));
        await db.lead.update({
          where: { id: leadId },
          data: { tags }
        });
        return { success: true, message: `Added tag ${action.config.tag}` };
      }

      case 'create_task': {
        const leadId = entity.id;
        const assignedToId = action.config.assignedToId || entity.assignedToId || null;
        const dueInDays = Number(action.config.dueInDays || 0);
        await db.task.create({
          data: {
            organizationId,
            title: action.config.title,
            type: action.config.type || 'OTHER',
            priority: action.config.priority || 'MEDIUM',
            status: 'PENDING',
            relatedLeadId: leadId,
            assignedToId,
            createdById: actorId,
            dueDate: dueInDays ? new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000) : null
          }
        });
        return { success: true, message: `Created task: ${action.config.title}` };
      }

      case 'send_notification': {
        const recipientUserId = action.config.userId || entity.assignedToId;
        if (!recipientUserId) {
          return { success: false, error: 'No recipient user ID for notification' };
        }
        await db.notification.create({
          data: {
            organizationId,
            userId: recipientUserId,
            type: 'INBOX_MESSAGE', // use standard type
            title: action.config.title,
            body: action.config.body,
            entityType: 'lead',
            entityId: entity.id,
            channel: 'IN_APP'
          }
        });
        return { success: true, message: `Sent in-app notification to user ${recipientUserId}` };
      }

      case 'send_instagram_message': {
        const leadId = entity.id;
        const conv = await db.instagramConversation.findFirst({
          where: { leadId },
          orderBy: { lastMessageAt: 'desc' }
        });
        if (!conv) {
          return { success: false, error: 'No active Instagram conversation found for lead' };
        }
        const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;
        if (!conv.lastInboundAt || Date.now() - conv.lastInboundAt.getTime() > MESSAGING_WINDOW_MS) {
          return { success: false, error: 'Instagram messaging window is closed' };
        }
        const parts = conv.igConversationId.split('_');
        const senderIgUserId = parts.slice(1).join('_');
        const tempMid = `local_${crypto.randomUUID()}`;
        const msg = await db.message.create({
          data: {
            organizationId,
            conversationId: conv.id,
            mid: tempMid,
            direction: 'OUTBOUND',
            contentType: 'TEXT',
            content: { text: action.config.content },
            sentAt: new Date(),
            senderId: actorId
          }
        });
        await enqueue(QUEUE.INSTAGRAM_SEND, 'instagram-send-job', {
          organizationId,
          conversationId: conv.id,
          messageId: msg.id,
          recipientIgUserId: senderIgUserId,
          content: { text: action.config.content },
          igAccountId: conv.igAccountId
        });
        return { success: true, message: `Enqueued Instagram message to queue` };
      }

      case 'rescore_lead': {
        const leadId = entity.id;
        if (!entity.firstName) {
          return { success: false, error: 'Entity is not a lead' };
        }
        await enqueue(QUEUE.AI_SCORING, 'score-lead', {
          leadId,
          organizationId,
          triggerEvent: 'MANUAL_RESCORE'
        });
        return { success: true, message: 'Enqueued AI rescoring request' };
      }

      case 'send_whatsapp_template': {
        // Requires: action.config.templateName, action.config.templateLanguage, action.config.accountId
        // Lead must have a phone number (entity.phone)
        const leadPhone = entity.phone as string | null | undefined;
        if (!leadPhone) {
          return { success: false, error: 'Lead has no phone number for WhatsApp template send' };
        }
        const accountId = action.config.accountId as string | undefined;
        if (!accountId) {
          return { success: false, error: 'No WhatsApp accountId configured for this action' };
        }

        // Find an active WhatsApp conversation by customer phone
        const waConv = await db.whatsAppConversation.findFirst({
          where: { customerPhone: leadPhone, status: 'OPEN' },
          orderBy: { lastMessageAt: 'desc' },
          select: { id: true },
        });

        if (!waConv) {
          return { success: false, error: 'No open WhatsApp conversation found for this lead phone' };
        }

        // Enqueue template send — templates bypass the 24h window restriction
        await enqueue(QUEUE.WHATSAPP_SEND, 'whatsapp-send', {
          conversationId: waConv.id,
          accountId,
          customerPhone: leadPhone,
          templateName: action.config.templateName as string,
          templateLanguage: (action.config.templateLanguage as string | undefined) ?? 'en',
          orgId: organizationId,
        });

        return { success: true, message: `Enqueued WhatsApp template "${action.config.templateName}" to queue` };
      }

      case 'outbound_webhook': {
        // Requires: action.config.url, action.config.headers (optional), action.config.body (optional)
        const webhookUrl = action.config.url as string | undefined;
        if (!webhookUrl) {
          return { success: false, error: 'No webhook URL configured for outbound_webhook action' };
        }

        // SSRF protection — resolves hostname and blocks private IPs
        await assertPublicUrl(webhookUrl);

        const customHeaders = (action.config.headers as Record<string, string> | undefined) ?? {};
        const payload = {
          ...(typeof action.config.body === 'object' && action.config.body !== null
            ? (action.config.body as Record<string, unknown>)
            : {}),
          _meta: {
            organizationId,
            entityId: entity.id,
            triggeredAt: new Date().toISOString(),
          },
        };

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'LeadOS-Workflow/1.0',
            ...customHeaders,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000), // 10s hard timeout
        });

        if (!response.ok) {
          return {
            success: false,
            error: `Webhook ${webhookUrl} returned HTTP ${response.status}`,
          };
        }

        return { success: true, message: `Outbound webhook POST to ${webhookUrl} succeeded (${response.status})` };
      }

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

