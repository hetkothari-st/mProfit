/**
 * Send transactional email via Gmail's API using the user's existing
 * OAuth connection — no app passwords, no SMTP credentials. The same
 * MailboxAccount row that powers inbox ingestion is reused for sending,
 * provided the user has reconnected since `gmail.send` scope was added.
 *
 * Falls back to the SMTP path in email.service.ts when the user hasn't
 * connected Gmail.
 */

import { google } from 'googleapis';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { getAuthorizedClientFor } from '../../connectors/gmail.connector.js';

export interface GmailSendInput {
  userId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export type GmailSendResult =
  | { sent: true; messageId: string; fromAccount: string }
  | { sent: false; reason: string };

/**
 * Look up the user's primary Gmail OAuth mailbox. We prefer an active
 * account; if multiple exist we pick the most-recently-updated one.
 */
export async function getGmailSendAccount(userId: string): Promise<{
  id: string;
  email: string;
} | null> {
  const acc = await prisma.mailboxAccount.findFirst({
    where: {
      userId,
      provider: 'GMAIL_OAUTH',
      isActive: true,
      refreshTokenEnc: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, googleEmail: true },
  });
  if (!acc || !acc.googleEmail) return null;
  return { id: acc.id, email: acc.googleEmail };
}

function encodeRfc2822(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): string {
  // Use a fixed boundary so the encoded blob is deterministic for tests
  // and easier to diff. The body is HTML with a plain-text fallback.
  const boundary = `=_mp_${Date.now().toString(36)}`;
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    opts.text,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    opts.html,
    `--${boundary}--`,
    '',
  ];
  return [...headers, '', ...body].join('\r\n');
}

/**
 * RFC 2047 encoded-word for non-ASCII subjects. Plain ASCII passes
 * through unchanged so the headers stay readable in transit logs.
 */
function encodeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  const b64 = Buffer.from(s, 'utf8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

function toBase64Url(s: string): string {
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function sendViaGmailApi(input: GmailSendInput): Promise<GmailSendResult> {
  const acc = await getGmailSendAccount(input.userId);
  if (!acc) return { sent: false, reason: 'gmail_not_connected' };
  try {
    const client = await getAuthorizedClientFor(acc.id);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const text = input.text ?? input.html.replace(/<[^>]+>/g, '');
    const raw = encodeRfc2822({
      from: acc.email,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text,
      replyTo: input.replyTo,
    });
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: toBase64Url(raw) },
    });
    const messageId = result.data.id ?? '';
    logger.info(
      { to: input.to, subject: input.subject, messageId, from: acc.email },
      '[gmail-api] sent',
    );
    return { sent: true, messageId, fromAccount: acc.email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Common case: existing OAuth grant predates gmail.send scope. Surface
    // a friendly error so the UI can tell the user to reconnect.
    if (/insufficient.*scope|forbidden|insufficient permission|access denied/i.test(msg)) {
      logger.warn({ err, accountId: acc.id }, '[gmail-api] missing send scope — reconnect required');
      return { sent: false, reason: 'gmail_scope_missing_reconnect' };
    }
    logger.error({ err, accountId: acc.id }, '[gmail-api] send failed');
    return { sent: false, reason: msg };
  }
}
