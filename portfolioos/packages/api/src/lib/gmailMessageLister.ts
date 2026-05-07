import { google, type gmail_v1 } from 'googleapis';
import { getAuthorizedClientFor } from '../connectors/gmail.connector.js';
import { logger } from './logger.js';

/**
 * Wraps the parts of the Gmail REST API the scan worker needs.
 * Centralised so quota / retry / typed-response handling lives in one place.
 */

export interface GmailMessageHeader {
  messageId: string;
  threadId: string;
  fromAddress: string;
  subject: string;
  receivedAt: Date;
}

export interface GmailAttachmentMeta {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface GmailMessageWithAttachments {
  header: GmailMessageHeader;
  attachments: GmailAttachmentMeta[];
}

const ATTACHMENT_QUERY =
  '(filename:pdf OR filename:xlsx OR filename:xls OR filename:csv) has:attachment';

const PROMO_FILENAME_RE = /(unsubscribe|newsletter|promotion|deals?)/i;

function formatDate(d: Date): string {
  // Gmail expects YYYY/MM/DD in `after:` and `before:` filters.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

export function buildScanQuery(lookbackFrom: Date, lookbackTo: Date): string {
  return `${ATTACHMENT_QUERY} after:${formatDate(lookbackFrom)} before:${formatDate(lookbackTo)}`;
}

export async function listMessageIdsPage(
  mailboxId: string,
  query: string,
  pageToken: string | null,
): Promise<{ ids: string[]; nextPageToken: string | null }> {
  const auth = await getAuthorizedClientFor(mailboxId);
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 500,
    pageToken: pageToken ?? undefined,
  });
  const ids = (res.data.messages ?? []).map((m) => m.id!).filter(Boolean);
  return { ids, nextPageToken: res.data.nextPageToken ?? null };
}

function header(parts: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return (parts ?? []).find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: GmailAttachmentMeta[],
): void {
  if (!part) return;
  if (part.body?.attachmentId && part.filename && !PROMO_FILENAME_RE.test(part.filename)) {
    out.push({
      attachmentId: part.body.attachmentId,
      fileName: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      size: part.body.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) walkParts(child, out);
}

export async function fetchMessageWithAttachments(
  mailboxId: string,
  messageId: string,
): Promise<GmailMessageWithAttachments | null> {
  const auth = await getAuthorizedClientFor(mailboxId);
  const gmail = google.gmail({ version: 'v1', auth });
  let msg;
  try {
    msg = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
  } catch (err) {
    logger.warn({ err, messageId }, '[gmailLister] message.get failed');
    return null;
  }
  const headers = msg.data.payload?.headers ?? undefined;
  const attachments: GmailAttachmentMeta[] = [];
  walkParts(msg.data.payload ?? undefined, attachments);
  if (attachments.length === 0) return null;
  const dateRaw = header(headers, 'Date');
  return {
    header: {
      messageId,
      threadId: msg.data.threadId ?? '',
      fromAddress: header(headers, 'From'),
      subject: header(headers, 'Subject'),
      receivedAt: dateRaw ? new Date(dateRaw) : new Date(),
    },
    attachments,
  };
}

export async function downloadAttachmentBytes(
  mailboxId: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const auth = await getAuthorizedClientFor(mailboxId);
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  const data = res.data.data ?? '';
  // Gmail returns base64url — convert to Buffer.
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
