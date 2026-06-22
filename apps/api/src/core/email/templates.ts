// Sprint 7 M1 — typed notification email templates. Each returns subject + html + text.
// Plain, token-free HTML (email clients ignore app CSS). Kept minimal; richer templating
// can follow once the sending domain is SPF/DKIM-verified and the channel is enabled.

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function shell(title: string, bodyHtml: string): string {
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5">`,
    `<h2 style="font-size:16px;margin:0 0 12px">${title}</h2>`,
    bodyHtml,
    `<p style="font-size:12px;color:#888;margin-top:24px">— LeadOS</p>`,
    `</div>`,
  ].join('');
}

export function inboxMessageEmail(input: { senderName: string; preview: string }): RenderedEmail {
  const subject = `New message from ${input.senderName}`;
  const html = shell(
    subject,
    `<p>${escapeHtml(input.senderName)} sent you a new message:</p>` +
      `<blockquote style="margin:8px 0;padding:8px 12px;border-left:3px solid #ccc;color:#444">${escapeHtml(
        input.preview,
      )}</blockquote>`,
  );
  const text = `New message from ${input.senderName}: ${input.preview}`;
  return { subject, html, text };
}

export function conversationAssignedEmail(input: {
  conversationName: string;
  assignedByName: string;
}): RenderedEmail {
  const subject = `You were assigned a conversation`;
  const html = shell(
    subject,
    `<p>${escapeHtml(input.assignedByName)} assigned you the conversation with ` +
      `<strong>${escapeHtml(input.conversationName)}</strong>.</p>`,
  );
  const text = `${input.assignedByName} assigned you the conversation with ${input.conversationName}.`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
