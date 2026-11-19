import { SUPPORT_TOPIC_LABELS, type SupportTopic } from '@everypaisa/shared';

export interface SupportEmailInput {
  ticketId: string;
  topic: SupportTopic;
  subject: string;
  message: string;
  pagePath: string | null;
  from: { name: string | null; email: string };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The short reference shown to the user and used in the email subject. */
export function ticketRef(ticketId: string): string {
  return ticketId.slice(-6).toUpperCase();
}

/**
 * The notification the support inbox receives. Everything the user typed is HTML-escaped (a message is
 * untrusted text rendered in a mail client). Reply-To is set by the caller to the user's address, so
 * answering the email reaches them.
 */
export function buildSupportEmail(input: SupportEmailInput): { subject: string; html: string; text: string } {
  const ref = ticketRef(input.ticketId);
  const who = input.from.name ? `${input.from.name} <${input.from.email}>` : input.from.email;
  const topic = SUPPORT_TOPIC_LABELS[input.topic];
  // Header injection guard: a subject line must stay on one line.
  const subjectLine = input.subject.replace(/[\r\n]+/g, ' ').trim();

  const html =
    `<p><strong>${escapeHtml(topic)}</strong> &middot; ticket ${escapeHtml(ref)}</p>` +
    `<p><strong>From:</strong> ${escapeHtml(who)}${input.pagePath ? `<br><strong>Screen:</strong> ${escapeHtml(input.pagePath)}` : ''}</p>` +
    `<p><strong>${escapeHtml(subjectLine)}</strong></p>` +
    `<p>${escapeHtml(input.message).replace(/\r?\n/g, '<br>')}</p>` +
    `<p style="color:#64748b;font-size:12px">Reply to this email to answer the user. Update the status in Settings &rarr; Support requests.</p>`;

  const text =
    `${topic} - ticket ${ref}\nFrom: ${who}\n${input.pagePath ? `Screen: ${input.pagePath}\n` : ''}\n` +
    `${subjectLine}\n\n${input.message}\n\nReply to this email to answer the user.`;

  return { subject: `[Support ${ref}] ${subjectLine}`, html, text };
}
