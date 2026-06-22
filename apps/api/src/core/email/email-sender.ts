// Sprint 7 M1 — shared email port. Single email abstraction for the platform
// (promotes the auth-specific sender concept in modules/auth/email.ts to core).
// In-app notifications are the primary channel; email is a flag-gated secondary
// channel. Without the flag + SENDGRID_API_KEY, delivery degrades to logging so
// every flow is fully testable with no network (G-11 — no provider calls in CI).

import { env } from '../config/env.js';
import { isEnabled } from '../flags/flags.js';
import { logger } from '../observability/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

function domainOf(email: string): string {
  return email.split('@')[1] ?? 'unknown';
}

/** Default sender: logs the recipient domain + subject (no PII body), never calls out. */
export class LoggingEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    logger.info({
      message: 'email.send (logging sender)',
      toDomain: domainOf(message.to),
      subject: message.subject,
    });
  }
}

/** SendGrid sender via REST (no SDK dependency). Used only when the email flag is on. */
export class SendGridEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly defaultFrom: string,
    private readonly defaultReplyTo?: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const from = message.from ?? this.defaultFrom;
    const replyTo = message.replyTo ?? this.defaultReplyTo;
    const body = {
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: from },
      ...(replyTo ? { reply_to: { email: replyTo } } : {}),
      subject: message.subject,
      content: [
        { type: 'text/plain', value: message.text },
        { type: 'text/html', value: message.html },
      ],
    };
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`SendGrid send failed: ${res.status} ${detail.slice(0, 200)}`);
    }
  }
}

let cached: EmailSender | undefined;

/**
 * Resolve the active sender. Returns SendGrid only when the email channel is enabled
 * AND fully configured; otherwise the logging sender. Memoized per process.
 */
export function getEmailSender(): EmailSender {
  if (cached) return cached;
  if (isEnabled('notifications.email.enabled') && env.SENDGRID_API_KEY && env.EMAIL_FROM) {
    cached = new SendGridEmailSender(env.SENDGRID_API_KEY, env.EMAIL_FROM, env.EMAIL_REPLY_TO);
  } else {
    cached = new LoggingEmailSender();
  }
  return cached;
}

/** Test seam — reset the memoized sender (used after toggling flags/env in tests). */
export function resetEmailSender(): void {
  cached = undefined;
}
