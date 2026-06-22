// Sprint 7 M1 — email delivery worker. Consumes EMAIL_DELIVERY jobs, renders the
// requested template, and sends via the active EmailSender (LoggingEmailSender unless
// the email channel is enabled + SendGrid configured). No provider call in CI.

import type { Job } from 'bullmq';
import { logger } from '../../observability/logger.js';
import { getEmailSender } from '../../email/email-sender.js';
import {
  inboxMessageEmail,
  conversationAssignedEmail,
  type RenderedEmail,
} from '../../email/templates.js';

export const EMAIL_DELIVERY_JOB = 'email-deliver';

export type EmailTemplateKey = 'inbox_message' | 'conversation_assigned';

export interface EmailDeliveryPayload {
  to: string;
  templateKey: EmailTemplateKey;
  data: Record<string, string>;
}

function render(templateKey: EmailTemplateKey, data: Record<string, string>): RenderedEmail {
  switch (templateKey) {
    case 'inbox_message':
      return inboxMessageEmail({ senderName: data['senderName'] ?? 'Someone', preview: data['preview'] ?? '' });
    case 'conversation_assigned':
      return conversationAssignedEmail({
        conversationName: data['conversationName'] ?? 'a conversation',
        assignedByName: data['assignedByName'] ?? 'A teammate',
      });
    default:
      throw new Error(`Unknown email template: ${templateKey as string}`);
  }
}

export async function processEmailDeliveryJob(job: Job<EmailDeliveryPayload>): Promise<void> {
  const { to, templateKey, data } = job.data;
  const rendered = render(templateKey, data);
  await getEmailSender().send({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });
  logger.debug({ message: 'email delivered', templateKey, toDomain: to.split('@')[1] ?? 'unknown' });
}
