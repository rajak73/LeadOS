// WhatsApp Cloud API adapter interface + implementations.
//
// All Meta Cloud API calls go through this interface. The WhatsApp module never
// calls fetch() to Meta directly — it calls the adapter. This makes the entire
// WhatsApp integration testable without network calls.
//
// MetaWhatsAppAdapter: calls real Meta Cloud API endpoints.
// SandboxWhatsAppAdapter: deterministic in-process implementation for integration tests.

import crypto from 'crypto';
import { env } from '../../core/config/env.js';

// ─── Value types ─────────────────────────────────────────────────────────────

export interface WaTextContent {
  type: 'text';
  text: string;
}

export interface WaTemplateContent {
  type: 'template';
  templateName: string;
  languageCode: string;
  components?: WaTemplateComponent[];
}

export interface WaTemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters?: WaTemplateParameter[];
}

export interface WaTemplateParameter {
  type: 'text' | 'image' | 'document' | 'video';
  text?: string;
  image?: { link: string };
}

export type WaMessageContent = WaTextContent | WaTemplateContent;

export interface WaSendResult {
  waMessageId: string; // Meta's globally unique message ID
}

export interface WaRawTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown[];
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface WhatsAppAdapter {
  /**
   * Send a text or template message to a recipient phone number.
   * Free-form text requires the 24h messaging window to be open.
   * Template messages work outside the window.
   */
  sendMessage(
    toPhone: string,
    content: WaMessageContent,
    phoneNumberId: string,
    accessToken: string,
  ): Promise<WaSendResult>;

  /**
   * Fetch all approved message templates for a WABA account.
   */
  getTemplates(wabaId: string, accessToken: string): Promise<WaRawTemplate[]>;

  /**
   * Verify the HMAC-SHA256 signature of an incoming Meta webhook.
   * Returns true if the payload matches the signature.
   * The rawBody must be the raw Buffer before any JSON parsing.
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string, appSecret: string): boolean;
}

// ─── Meta Cloud API implementation ───────────────────────────────────────────

const GRAPH_BASE = 'https://graph.facebook.com';

async function cloudFetch(
  path: string,
  opts: RequestInit = {},
  apiVersion?: string,
): Promise<Record<string, unknown>> {
  const version = apiVersion ?? env.META_API_VERSION;
  const url = `${GRAPH_BASE}/${version}${path}`;
  const res = await fetch(url, opts);
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = body['error'] as Record<string, unknown> | undefined;
    throw new Error(
      `Meta Cloud API ${res.status}: ${(err?.['message'] as string | undefined) ?? 'unknown error'}`,
    );
  }
  return body;
}

export class MetaWhatsAppAdapter implements WhatsAppAdapter {
  async sendMessage(
    toPhone: string,
    content: WaMessageContent,
    phoneNumberId: string,
    accessToken: string,
  ): Promise<WaSendResult> {
    let messageBody: Record<string, unknown>;

    if (content.type === 'text') {
      messageBody = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { body: content.text },
      };
    } else {
      // Template message
      messageBody = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'template',
        template: {
          name: content.templateName,
          language: { code: content.languageCode },
          ...(content.components ? { components: content.components } : {}),
        },
      };
    }

    const result = await cloudFetch(`/${phoneNumberId}/messages?access_token=${accessToken}`, {
      method: 'POST',
      body: JSON.stringify(messageBody),
      headers: { 'Content-Type': 'application/json' },
    });

    return { waMessageId: result['messages'] as unknown as string };
  }

  async getTemplates(wabaId: string, accessToken: string): Promise<WaRawTemplate[]> {
    const result = await cloudFetch(
      `/${wabaId}/message_templates?fields=id,name,language,category,status,components&access_token=${accessToken}`,
    );
    const data = result['data'] as WaRawTemplate[] | undefined;
    return data ?? [];
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string, appSecret: string): boolean {
    // Meta sends: X-Hub-Signature-256: sha256=<hex>
    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

// ─── Sandbox implementation (tests + local dev without Meta credentials) ─────

export class SandboxWhatsAppAdapter implements WhatsAppAdapter {
  async sendMessage(
    _toPhone: string,
    content: WaMessageContent,
    _phoneNumberId: string,
    _accessToken: string,
  ): Promise<WaSendResult> {
    const templatePart = content.type === 'template' ? `-tpl-${content.templateName}` : '';
    return { waMessageId: `sb-wa-mid-${Date.now().toString()}${templatePart}` };
  }

  async getTemplates(_wabaId: string, _accessToken: string): Promise<WaRawTemplate[]> {
    return [
      {
        id: 'sb-tpl-001',
        name: 'hello_world',
        language: 'en',
        category: 'UTILITY',
        status: 'APPROVED',
        components: [{ type: 'BODY', text: 'Hello {{1}}! Welcome to {{2}}.' }],
      },
    ];
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string, appSecret: string): boolean {
    // In sandbox: compute real HMAC so integration tests can send valid signatures.
    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

// Singleton adapter — swapped to SandboxWhatsAppAdapter in tests via this condition.
export const whatsappAdapter: WhatsAppAdapter =
  env.NODE_ENV === 'test' ? new SandboxWhatsAppAdapter() : new MetaWhatsAppAdapter();
