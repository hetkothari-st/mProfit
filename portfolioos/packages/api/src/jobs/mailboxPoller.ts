import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ImportType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { decryptSecret } from '../lib/secrets.js';
import { createImportJob } from '../services/imports/import.service.js';
import { syncGmailAccount } from '../connectors/gmail.connector.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';

const ALLOWED_EXT = new Set(['.pdf', '.csv', '.tsv', '.xlsx', '.xls', '.html', '.htm']);

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
  if (s.includes('cas') || s.includes('consolidated account')) {
    return ext === '.pdf' ? 'MF_CAS_PDF' : 'MF_CAS_EXCEL';
  }
  if (s.includes('contract')) {
    if (ext === '.pdf') return 'CONTRACT_NOTE_PDF';
    if (ext === '.html' || ext === '.htm') return 'CONTRACT_NOTE_HTML';
    return 'CONTRACT_NOTE_EXCEL';
  }
  if (s.includes('bank') || s.includes('statement')) {
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

async function pollOne(
  accountId: string,
): Promise<{ processed: number; imported: number; errors: number }> {
  const acc = await prisma.mailboxAccount.findUnique({ where: { id: accountId } });
  if (!acc || !acc.isActive) return { processed: 0, imported: 0, errors: 0 };
  if (acc.provider !== 'IMAP' || !acc.host || !acc.port || !acc.username || !acc.passwordEnc) {
    return { processed: 0, imported: 0, errors: 0 };
  }

  const password = decryptSecret(acc.passwordEnc);
  const client = new ImapFlow({
    host: acc.host,
    port: acc.port,
    secure: acc.secure,
    auth: { user: acc.username, pass: password },
    logger: false,
  });

  let processed = 0;
  let imported = 0;
  let errors = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(acc.folder);
    try {
      const since = acc.lastPolledAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const search: Record<string, unknown> = { since, seen: false };
      if (acc.fromFilter) search.from = acc.fromFilter;
      if (acc.subjectFilter) search.subject = acc.subjectFilter;

      const uids = await client.search(search, { uid: true });
      if (!uids) {
        return { processed: 0, imported: 0, errors: 0 };
      }
      for (const uid of uids) {
        processed++;
        try {
          const msg = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
          if (!msg || !msg.source) continue;
          const parsed = await simpleParser(msg.source as Buffer);
          const from = parsed.from?.text ?? '';
          const subject = parsed.subject ?? '';

          for (const att of parsed.attachments ?? []) {
            const fileName = att.filename ?? `attachment-${uid}`;
            const ext = extname(fileName).toLowerCase();
            if (!ALLOWED_EXT.has(ext)) continue;

            const filePath = await saveAttachment(att.content as Buffer, fileName);
            const type = inferType(fileName, subject);
            const broker = inferBroker(subject, from);

            await createImportJob({
              userId: acc.userId,
              portfolioId: null,
              type,
              fileName,
              filePath,
              broker,
            });
            imported++;
          }

          // Mark message seen via UID
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        } catch (err) {
          errors++;
          logger.warn({ err, uid, accountId }, '[mailbox] message failed');
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    logger.error({ err, accountId }, '[mailbox] poll failed');
    await prisma.mailboxAccount.update({
      where: { id: accountId },
      data: { lastError: (err as Error).message, lastPolledAt: new Date() },
    });
    // Best-effort socket teardown after the primary poll failure — the real
    // error is already logged above; a close() failure here would just be
    // noise.
    // eslint-disable-next-line portfolioos/no-silent-catch -- best-effort cleanup
    try { await client.close(); } catch { /* ignore */ }
    return { processed, imported, errors: errors + 1 };
  }

  await prisma.mailboxAccount.update({
    where: { id: accountId },
    data: { lastPolledAt: new Date(), lastError: null },
  });
  return { processed, imported, errors };
}

export async function pollAllMailboxes(): Promise<void> {
  // MailboxAccount isn't user-scoped (not in USER_SCOPED_MODELS), but to scan
  // across every user's accounts we still need the bypass so the scheduler is
  // explicit that it's running cross-tenant.
  const accounts = await runAsSystem(() =>
    prisma.mailboxAccount.findMany({ where: { isActive: true } }),
  );
  for (const acc of accounts) {
    try {
      // Each mailbox belongs to one user; downstream import-job creation is
      // user-scoped and RLS-enforced.
      const r = await runAsUser(acc.userId, async () =>
        acc.provider === 'GMAIL_OAUTH'
          ? syncGmailAccount(acc.id)
          : pollOne(acc.id),
      );
      logger.info(
        { accountId: acc.id, provider: acc.provider, ...r },
        '[mailbox] polled',
      );
    } catch (err) {
      logger.error({ err, accountId: acc.id }, '[mailbox] poller error');
    }
  }
}

let timer: NodeJS.Timeout | null = null;

export function startMailboxPoller(): void {
  if (env.ENABLE_MAILBOX_POLLER !== 'true') {
    logger.info('[mailbox] poller disabled');
    return;
  }
  const intervalMs = env.MAILBOX_POLL_INTERVAL_MIN * 60 * 1000;
  logger.info({ intervalMin: env.MAILBOX_POLL_INTERVAL_MIN }, '[mailbox] poller started');
  // First run after a short delay
  setTimeout(() => {
    pollAllMailboxes().catch((err) => logger.error({ err }, '[mailbox] initial poll failed'));
  }, 30_000).unref();
  timer = setInterval(() => {
    pollAllMailboxes().catch((err) => logger.error({ err }, '[mailbox] poll tick failed'));
  }, intervalMs);
  timer.unref();
}

export function stopMailboxPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function testMailboxConnection(
  host: string,
  port: number,
  secure: boolean,
  username: string,
  password: string,
): Promise<{ ok: boolean; message?: string; code?: string; responseText?: string; hint?: string }> {
  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user: username, pass: password },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (err) {
    // Best-effort socket teardown on connection-test failure; the actual
    // error is returned to the caller below.
    // eslint-disable-next-line portfolioos/no-silent-catch -- best-effort cleanup
    try { await client.close(); } catch { /* ignore */ }
    const e = err as Error & {
      authenticationFailed?: boolean;
      response?: string;
      responseText?: string;
      responseStatus?: string;
      code?: string;
    };
    logger.warn(
      {
        host,
        port,
        secure,
        username,
        err: {
          message: e.message,
          code: e.code,
          authenticationFailed: e.authenticationFailed,
          response: e.response,
          responseText: e.responseText,
        },
      },
      '[mailbox] test connection failed',
    );

    const responseText = e.responseText ?? e.response;
    let hint: string | undefined;
    const msg = `${e.message ?? ''} ${responseText ?? ''}`.toLowerCase();
    if (e.authenticationFailed || msg.includes('authenticationfailed') || msg.includes('invalid credentials') || msg.includes('login failed')) {
      if (host.includes('gmail') || host.includes('google')) {
        hint =
          'Gmail rejected the login. Use an App Password (not your account password), and enable IMAP in Gmail → Settings → Forwarding and POP/IMAP. App Passwords require 2-Step Verification to be enabled first.';
      } else if (host.includes('outlook') || host.includes('office365') || host.includes('hotmail')) {
        hint =
          'Outlook/Office365 rejected the login. Use an App Password from https://account.microsoft.com/security, or enable IMAP/OAuth as required by your tenant.';
      } else if (host.includes('yahoo')) {
        hint = 'Yahoo rejected the login. Generate an App Password from Yahoo Account Security.';
      } else {
        hint = 'The IMAP server rejected the credentials. Check username, password, and whether your provider requires an app-specific password.';
      }
    } else if (msg.includes('enotfound') || msg.includes('econnrefused') || msg.includes('etimedout')) {
      hint = `Could not reach ${host}:${port}. Check the host/port and that your network allows outbound IMAPS.`;
    } else if (!responseText && !e.message) {
      hint = 'The server closed the connection without a reason. If using Gmail, ensure IMAP is enabled and you are using an App Password.';
    }

    return {
      ok: false,
      message: responseText || e.message || 'Connection failed',
      code: e.code,
      responseText,
      hint,
    };
  }
}

export async function pollMailboxNow(accountId: string) {
  return pollOne(accountId);
}
