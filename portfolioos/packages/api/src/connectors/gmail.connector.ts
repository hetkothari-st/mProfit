import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { ImportType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { encryptSecret, decryptSecret } from '../lib/secrets.js';
import { createImportJob } from '../services/imports/import.service.js';

// readonly for inbox ingestion + send for outbound rent reminders.
// Existing users who connected before send scope landed will need to
// reconnect (we force prompt='consent' on every connect, so the next
// connect picks up the new scope automatically).
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];
const ALLOWED_EXT = new Set(['.pdf', '.csv', '.tsv', '.xlsx', '.xls', '.html', '.htm']);

/**
 * Only whitelist filenames that match one of our known parseable types.
 * Anything else is skipped before import. This keeps the Imports list clean
 * and avoids churn every time a broker adds a new auto-email type.
 */
const ACCEPT_FILENAME_PATTERNS: RegExp[] = [
  // Contract notes — singular or plural (IIFL uses "contract-notes")
  /\bcontract[-_\s]?notes?\b/i,
  /^CN[-_].+\.pdf$/i,
  /\btrade[-_\s]?confirmations?\b/i,

  // IIFL / broker DP combined transaction + holding statements
  /transaction[-_\s]?with[-_\s]?holding[-_\s]?statement/i,
  /transaction[-_\s]?cum[-_\s]?holding[-_\s]?statement/i,

  // Mutual-fund CAS (CAMS / KFintech)
  /\bcas\b/i,
  /\bconsolidated[-_\s]?account[-_\s]?statement\b/i,
  /\bemail[-_\s]?cas\b/i,

  // NSDL / CDSL monthly transaction statement (YYYYMM_<clientid>_TXN.pdf)
  /_TXN\.pdf$/i,
  /\btxn[-_\s]?statement\b/i,

  // Non-PDF exports: CSV/Excel/HTML from broker back offices
  /\.(csv|tsv|xlsx|xls|html?|htm)$/i,
];

/**
 * Regulatory/compliance docs that brokers are legally required to send but
 * contain no importable transaction or holding data. Blocked even from trusted
 * (monitored) senders so they don't pollute the import history.
 */
const REGULATORY_SKIP_PATTERNS: RegExp[] = [
  /retention[-_\s]?(?:statement|account[-_\s]?statement)/i, // SEBI broker fund-retention report
  /\bmargin[-_\s]?statement\b/i,      // Daily margin utilisation report
  /\bmargin[-_\s]?pledge\b/i,
  /\bclient[-_\s]?reporting\b/i,
  /\bsebi[-_\s]?circular\b/i,
  /\bregulatory[-_\s]?disclosure\b/i,
  /\bannual[-_\s]?report\b/i,         // Company annual reports forwarded by broker
  /\bwelcome[-_\s]?kit\b/i,
  /\bonboarding\b/i,
];

function shouldSkipAttachment(fileName: string): boolean {
  return !ACCEPT_FILENAME_PATTERNS.some((re) => re.test(fileName));
}

function isRegulatoryDoc(fileName: string): boolean {
  return REGULATORY_SKIP_PATTERNS.some((re) => re.test(fileName));
}

/**
 * Trust attachments from approved senders. If FROM matches a MonitoredSender
 * address (full email or `@domain.com`), accept any parseable attachment
 * regardless of its filename pattern. This is what makes "approve once →
 * auto-import everything" actually work for CAS PDFs whose filenames don't
 * match the curated regex list (e.g. KFintech/CASParser-delivered files).
 */
function isFromMonitoredSender(
  fromHeader: string,
  monitoredAddresses: Set<string>,
): boolean {
  const m = fromHeader.match(/<([^>]+)>/);
  const addr = (m && m[1] ? m[1] : fromHeader).toLowerCase().trim();
  if (monitoredAddresses.has(addr)) return true;
  for (const a of monitoredAddresses) {
    if (a.startsWith('@') && addr.endsWith(a)) return true;
  }
  return false;
}

const BROKER_SENDERS =
  'cams OR camsonline OR kfintech OR karvy OR nsdl OR cdsl ' +
  'OR zerodha OR kite OR upstox OR icicidirect OR hdfcsec OR hdfcbank ' +
  'OR angelone OR angelbroking OR groww OR 5paisa OR kotak OR axisdirect OR axissec ' +
  'OR edelweiss OR motilal OR sharekhan OR iifl OR paytmmoney OR dhan';

const SUBJECT_KEYWORDS =
  '"contract note" OR "consolidated account" OR "CAS" OR ' +
  '"transaction statement" OR "trade confirmation" OR "account statement"';

const DEFAULT_QUERY =
  'has:attachment newer_than:2y ' +
  `(from:(${BROKER_SENDERS}) OR subject:(${SUBJECT_KEYWORDS}))`;

function assertConfigured(): void {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URL) {
    throw new Error(
      'Gmail OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URL in packages/api/.env',
    );
  }
}

function makeOAuthClient(): OAuth2Client {
  assertConfigured();
  return new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URL,
  );
}

export function buildGmailAuthUrl(userId: string): string {
  const client = makeOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    // 'select_account' forces Google to show the account picker so users with
    // multiple Google accounts can choose the right one.
    // 'consent' forces a fresh refresh_token on every connect.
    prompt: 'select_account consent',
    scope: SCOPES,
    state: userId,
    include_granted_scopes: true,
  });
}

export async function exchangeGmailCode(
  userId: string,
  code: string,
): Promise<{ id: string; email: string }> {
  const client = makeOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Revoke access at https://myaccount.google.com/permissions and try again with prompt=consent.',
    );
  }
  client.setCredentials(tokens);

  const gmail = google.gmail({ version: 'v1', auth: client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const email = profile.data.emailAddress;
  if (!email) throw new Error('Could not read email address from Gmail profile');

  const existing = await prisma.mailboxAccount.findFirst({
    where: { userId, provider: 'GMAIL_OAUTH', googleEmail: email },
  });

  const data = {
    userId,
    provider: 'GMAIL_OAUTH' as const,
    label: `Gmail: ${email}`,
    googleEmail: email,
    username: email,
    refreshTokenEnc: encryptSecret(tokens.refresh_token),
    accessTokenEnc: tokens.access_token ? encryptSecret(tokens.access_token) : null,
    tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    isActive: true,
    lastError: null,
  };

  if (existing) {
    await prisma.mailboxAccount.update({ where: { id: existing.id }, data });
    return { id: existing.id, email };
  }
  const row = await prisma.mailboxAccount.create({ data });
  return { id: row.id, email };
}

export async function getAuthorizedClientFor(accountId: string): Promise<OAuth2Client> {
  const acc = await prisma.mailboxAccount.findUnique({ where: { id: accountId } });
  if (!acc || acc.provider !== 'GMAIL_OAUTH' || !acc.refreshTokenEnc) {
    throw new Error('Invalid Gmail account');
  }
  const client = makeOAuthClient();
  const now = Date.now();
  const expiry = acc.tokenExpiresAt?.getTime();
  const accessTokenLikelyValid =
    acc.accessTokenEnc && expiry && expiry - now > 60_000; // at least 60s headroom

  client.setCredentials({
    refresh_token: decryptSecret(acc.refreshTokenEnc),
    // Only pass an access_token if it's still comfortably valid; otherwise let
    // google-auth-library fetch a fresh one on first call.
    ...(accessTokenLikelyValid
      ? {
          access_token: decryptSecret(acc.accessTokenEnc!),
          expiry_date: expiry,
        }
      : {}),
  });
  client.on('tokens', (tokens: { access_token?: string | null; expiry_date?: number | null; refresh_token?: string | null }) => {
    void (async () => {
      const update: Record<string, unknown> = {};
      if (tokens.access_token) update.accessTokenEnc = encryptSecret(tokens.access_token);
      if (tokens.expiry_date) update.tokenExpiresAt = new Date(tokens.expiry_date);
      if (tokens.refresh_token) update.refreshTokenEnc = encryptSecret(tokens.refresh_token);
      if (Object.keys(update).length) {
        await prisma.mailboxAccount.update({ where: { id: acc.id }, data: update }).catch((err) => {
          logger.warn({ err, accountId }, '[gmail] failed to persist refreshed tokens');
        });
      }
    })();
  });
  return client;
}

function isGmailAuthError(err: unknown): boolean {
  const e = err as { code?: number; status?: number; response?: { status?: number } };
  const code = e?.code ?? e?.status ?? e?.response?.status;
  return code === 401 || code === 403;
}

async function markGmailAccountForReauth(accountId: string, reason: string): Promise<void> {
  try {
    await prisma.mailboxAccount.update({
      where: { id: accountId },
      data: {
        isActive: false,
        lastError: `Gmail access lost: ${reason}. Click Reconnect on the Mailboxes page.`,
        lastPolledAt: new Date(),
      },
    });
  } catch (err) {
    // This is itself the error-recovery path. If it fails, the worst case
    // is that the account stays marked active and the next poll fails the
    // same way — the user still sees broken sync, just via a different
    // surface. Log so operators aren't blind to it.
    logger.warn({ err, accountId, reason }, '[gmail] failed to mark account for reauth');
  }
}

function inferBroker(subject: string, from: string): string | null {
  const s = `${subject} ${from}`.toLowerCase();
  if (s.includes('zerodha') || s.includes('kite')) return 'Zerodha';
  if (s.includes('icicidirect') || s.includes('icici direct')) return 'ICICI Direct';
  if (s.includes('hdfc sec')) return 'HDFC Securities';
  if (s.includes('upstox')) return 'Upstox';
  if (s.includes('angel')) return 'Angel One';
  if (s.includes('groww')) return 'Groww';
  if (s.includes('5paisa')) return '5paisa';
  if (s.includes('kotak')) return 'Kotak Securities';
  if (s.includes('axis direct')) return 'Axis Direct';
  if (s.includes('cams')) return 'CAMS';
  if (s.includes('kfintech') || s.includes('karvy')) return 'KFintech';
  return null;
}

function inferType(fileName: string, subject: string): ImportType {
  const s = `${subject} ${fileName}`.toLowerCase();
  const ext = extname(fileName).toLowerCase();
  // Depository statements first — Zerodha "transaction-with-holding-statement"
  // and CDSL/NSDL TXN files are not bank statements. They share the MF_CAS_PDF
  // type because the depository CAS parser handles them.
  if (
    /transaction[-_\s]?with[-_\s]?holding/.test(s) ||
    /transaction[-_\s]?cum[-_\s]?holding/.test(s) ||
    /_txn(?:\.|$)/.test(s) ||
    /\bnsdl\b/.test(s) ||
    /\bcdsl\b/.test(s) ||
    s.includes('depository statement')
  ) {
    return ext === '.pdf' ? 'MF_CAS_PDF' : 'MF_CAS_EXCEL';
  }
  if (s.includes('cas') || s.includes('consolidated account')) {
    return ext === '.pdf' ? 'MF_CAS_PDF' : 'MF_CAS_EXCEL';
  }
  if (s.includes('contract')) {
    if (ext === '.pdf') return 'CONTRACT_NOTE_PDF';
    if (ext === '.html' || ext === '.htm') return 'CONTRACT_NOTE_HTML';
    return 'CONTRACT_NOTE_EXCEL';
  }
  // Bank/statement match LAST — depository statements caught above
  if (s.includes('bank statement') || s.includes('account statement')) {
    return ext === '.pdf' ? 'BANK_STATEMENT_PDF' : 'BANK_STATEMENT_CSV';
  }
  if (s.includes('nps')) return 'NPS_STATEMENT';
  if (ext === '.pdf') return 'CONTRACT_NOTE_PDF';
  if (ext === '.xlsx' || ext === '.xls') return 'GENERIC_EXCEL';
  return 'GENERIC_CSV';
}

async function saveAttachment(buf: Buffer, originalName: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const month = String(new Date().getUTCMonth() + 1).padStart(2, '0');
  const dir = join(env.UPLOAD_DIR, 'mailbox', `${year}-${month}`);
  await mkdir(dir, { recursive: true });
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const unique = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const filePath = join(dir, `${unique}-${safe}`);
  await writeFile(filePath, buf);
  return filePath;
}

function headerValue(headers: Array<{ name?: string | null; value?: string | null }> | undefined, name: string): string {
  if (!headers) return '';
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

interface GmailPart {
  partId?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  body?: { attachmentId?: string | null; size?: number | null; data?: string | null } | null;
  parts?: GmailPart[];
}

function collectAttachmentParts(part: GmailPart | undefined, out: GmailPart[]): void {
  if (!part) return;
  if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
    out.push(part);
  }
  for (const sub of part.parts ?? []) collectAttachmentParts(sub, out);
}

// Per-account lock: prevents concurrent syncGmailAccount calls from the
// auto-poller + manual scan racing each other and duplicating imports.
const syncInProgress = new Set<string>();

export async function syncGmailAccount(
  accountId: string,
): Promise<{ processed: number; imported: number; errors: number }> {
  if (syncInProgress.has(accountId)) {
    logger.info({ accountId }, '[gmail] sync already in progress — skipping');
    return { processed: 0, imported: 0, errors: 0 };
  }
  syncInProgress.add(accountId);
  try {
    return await _syncGmailAccount(accountId);
  } finally {
    syncInProgress.delete(accountId);
  }
}

async function _syncGmailAccount(
  accountId: string,
): Promise<{ processed: number; imported: number; errors: number }> {
  const acc = await prisma.mailboxAccount.findUnique({ where: { id: accountId } });
  if (!acc || !acc.isActive || acc.provider !== 'GMAIL_OAUTH') {
    return { processed: 0, imported: 0, errors: 0 };
  }

  let processed = 0;
  let imported = 0;
  let errors = 0;

  try {
    const auth = await getAuthorizedClientFor(accountId);
    const gmail = google.gmail({ version: 'v1', auth });

    const filterParts: string[] = [DEFAULT_QUERY, '-in:trash'];
    if (acc.fromFilter) filterParts.push(`from:${acc.fromFilter}`);
    if (acc.subjectFilter) filterParts.push(`subject:(${acc.subjectFilter})`);
    const q = filterParts.join(' ');

    // Load this user's monitored senders once — used to relax the filename
    // filter when the FROM is already trusted.
    const monitoredRows = await prisma.monitoredSender.findMany({
      where: { userId: acc.userId, isActive: true },
      select: { address: true },
    });
    const monitoredAddresses = new Set(
      monitoredRows.map((r) => r.address.toLowerCase()),
    );

    let pageToken: string | undefined;
    const messageIds: string[] = [];
    do {
      const list = await gmail.users.messages.list({
        userId: 'me',
        q,
        maxResults: 100,
        pageToken,
      });
      for (const m of list.data.messages ?? []) {
        if (m.id) messageIds.push(m.id);
      }
      pageToken = list.data.nextPageToken ?? undefined;
    } while (pageToken && messageIds.length < 500);

    logger.info({ accountId, q, matched: messageIds.length }, '[gmail] search complete');

    let authAborted = false;
    for (const id of messageIds) {
      if (authAborted) break;
      processed++;
      try {
        const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
        const payload = full.data.payload;
        const subject = headerValue(payload?.headers ?? undefined, 'Subject');
        const from = headerValue(payload?.headers ?? undefined, 'From');

        const atts: GmailPart[] = [];
        collectAttachmentParts(payload as GmailPart | undefined, atts);

        const fromTrusted = isFromMonitoredSender(from, monitoredAddresses);

        for (const att of atts) {
          const fileName = att.filename ?? `attachment-${id}`;
          const ext = extname(fileName).toLowerCase();
          if (!ALLOWED_EXT.has(ext)) continue;
          // Regulatory compliance docs (retention statements, margin reports,
          // etc.) have no importable data — skip even from trusted senders.
          if (isRegulatoryDoc(fileName)) {
            logger.debug({ fileName, accountId }, '[gmail] skipping regulatory doc');
            continue;
          }
          // For untrusted senders we still apply the curated filename filter
          // to avoid pulling random PDFs. Approved senders skip the filter so
          // CAS files with unusual names still land.
          if (!fromTrusted && shouldSkipAttachment(fileName)) {
            logger.debug({ fileName, accountId }, '[gmail] skipping non-parseable attachment');
            continue;
          }
          if (!att.body?.attachmentId) continue;

          // Skip if we've already pulled this exact Gmail message before —
          // catches re-syncs and partial-failure replays without re-downloading.
          const messageAlready = await prisma.importJob.findFirst({
            where: { userId: acc.userId, gmailMessageId: id },
            select: { id: true },
          });
          if (messageAlready) continue;

          const a = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: id,
            id: att.body.attachmentId,
          });
          const b64 = a.data.data;
          if (!b64) continue;
          const buf = Buffer.from(b64, 'base64');

          // Content-hash dedup — replaces the old filename-only check that
          // silently dropped same-named PDFs (e.g. weekly "Contract Note.pdf").
          const contentHash = createHash('sha256').update(buf).digest('hex');
          const hashAlready = await prisma.importJob.findFirst({
            where: { userId: acc.userId, contentHash },
            select: { id: true },
          });
          if (hashAlready) continue;

          const filePath = await saveAttachment(buf, fileName);
          const type = inferType(fileName, subject);
          const broker = inferBroker(subject, from);

          await createImportJob({
            userId: acc.userId,
            portfolioId: null,
            type,
            fileName,
            filePath,
            broker,
            contentHash,
            gmailMessageId: id,
          });
          imported++;
        }

      } catch (err) {
        errors++;
        if (isGmailAuthError(err)) {
          logger.error(
            { accountId, messageId: id },
            '[gmail] auth error during sync — aborting and marking account for reconnect',
          );
          await markGmailAccountForReauth(
            accountId,
            'Access token rejected (refresh_token may be expired or revoked)',
          );
          authAborted = true;
          break;
        }
        logger.warn({ err, messageId: id, accountId }, '[gmail] message failed');
      }
    }

    await prisma.mailboxAccount.update({
      where: { id: accountId },
      data: { lastPolledAt: new Date(), lastError: null },
    });
  } catch (err) {
    logger.error({ err, accountId }, '[gmail] sync failed');
    if (isGmailAuthError(err)) {
      await markGmailAccountForReauth(
        accountId,
        'Access token rejected (refresh_token may be expired or revoked)',
      );
    } else {
      await prisma.mailboxAccount.update({
        where: { id: accountId },
        data: { lastError: (err as Error).message, lastPolledAt: new Date() },
      }).catch(() => { /* ignore */ });
    }
    return { processed, imported, errors: errors + 1 };
  }

  return { processed, imported, errors };
}

export async function disconnectGmailAccount(accountId: string): Promise<void> {
  const acc = await prisma.mailboxAccount.findUnique({ where: { id: accountId } });
  if (!acc || acc.provider !== 'GMAIL_OAUTH') return;
  try {
    if (acc.refreshTokenEnc) {
      const client = makeOAuthClient();
      const refresh = decryptSecret(acc.refreshTokenEnc);
      await client.revokeToken(refresh).catch(() => { /* ignore */ });
    }
  } finally {
    await prisma.mailboxAccount.delete({ where: { id: accountId } });
  }
}

export function isGmailConfigured(): boolean {
  return Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REDIRECT_URL,
  );
}
