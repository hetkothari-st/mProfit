/**
 * Insurance documents from Gmail — only with the user's permission.
 *
 * Permission is per Gmail account (MailboxAccount.insuranceFetchEnabled),
 * off until the user turns it on, and every change is audit-logged. With it
 * on, an insurance scan (GmailScanJob kind INSURANCE) asks Gmail only for
 * PDFs from known insurers or with an insurance subject line — never the
 * whole inbox — classifies them, and holds them for the insurance pipeline.
 *
 * The first scan after turning it on looks back three years; every later
 * scan (nightly, or "Scan now") picks up from where the last one finished.
 */

import type { Request } from 'express';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { writeAuditLog } from '../../lib/audit.js';
import { NotFoundError } from '../../lib/errors.js';
import { runAsSystem, runAsUser } from '../../lib/requestContext.js';
import { createScanJob } from '../gmail/gmailScanJobs.service.js';

const FIRST_SCAN_YEARS = 3;
const ACTIVE_SCAN_STATUSES = ['PENDING', 'LISTING', 'DOWNLOADING', 'CLASSIFYING'] as const;

async function gmailMailboxFor(userId: string, mailboxId: string) {
  const mb = await prisma.mailboxAccount.findFirst({
    where: { id: mailboxId, userId, provider: 'GMAIL_OAUTH', isActive: true },
  });
  if (!mb) throw new NotFoundError('Gmail account not found');
  return mb;
}

/** Start an insurance scan unless one is already running for this mailbox. */
export async function startInsuranceScan(userId: string, mailboxId: string) {
  const running = await prisma.gmailScanJob.findFirst({
    where: { mailboxId, kind: 'INSURANCE', status: { in: [...ACTIVE_SCAN_STATUSES] } },
  });
  if (running) return running;

  const last = await prisma.gmailScanJob.findFirst({
    where: { mailboxId, kind: 'INSURANCE', status: 'COMPLETED' },
    orderBy: { lookbackTo: 'desc' },
    select: { lookbackTo: true },
  });
  const today = new Date(new Date().toISOString().slice(0, 10));
  const from = last
    ? last.lookbackTo
    : new Date(Date.UTC(today.getUTCFullYear() - FIRST_SCAN_YEARS, today.getUTCMonth(), today.getUTCDate()));
  // A scan that ends today and one that starts today overlap by a day on
  // purpose: mail that arrived after the last scan ran is not missed, and
  // attachments already seen are skipped by message + attachment id.
  const lookbackFrom = from.getTime() >= today.getTime() ? new Date(today.getTime() - 24 * 60 * 60 * 1000) : from;
  return createScanJob({ userId, mailboxId, lookbackFrom, lookbackTo: today, kind: 'INSURANCE' });
}

/** Turn the permission on or off. Turning it on starts the first scan. */
export async function setInsuranceFetch(
  userId: string,
  mailboxId: string,
  enabled: boolean,
  req?: Request,
) {
  const mb = await gmailMailboxFor(userId, mailboxId);
  if (mb.insuranceFetchEnabled === enabled) return { enabled, scan: null };

  await prisma.mailboxAccount.update({
    where: { id: mb.id },
    data: { insuranceFetchEnabled: enabled, insuranceFetchConsentAt: enabled ? new Date() : null },
  });
  await writeAuditLog({
    userId,
    action: enabled ? 'insurance_gmail_fetch_enabled' : 'insurance_gmail_fetch_disabled',
    resource: `MailboxAccount:${mb.id}`,
    metadata: { googleEmail: mb.googleEmail ?? null },
    req,
  });

  if (!enabled) {
    // Stop anything in flight: permission withdrawn means no more reading.
    await prisma.gmailScanJob.updateMany({
      where: { mailboxId: mb.id, kind: 'INSURANCE', status: { in: [...ACTIVE_SCAN_STATUSES] } },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    return { enabled, scan: null };
  }
  return { enabled, scan: await startInsuranceScan(userId, mb.id) };
}

/** "Scan now" — only for a mailbox the user has given permission on. */
export async function scanInsuranceNow(userId: string, mailboxId: string) {
  const mb = await gmailMailboxFor(userId, mailboxId);
  if (!mb.insuranceFetchEnabled) throw new NotFoundError('Insurance search is not turned on for this account');
  return startInsuranceScan(userId, mb.id);
}

export interface InsuranceFetchStatus {
  mailboxes: Array<{
    mailboxId: string;
    googleEmail: string | null;
    enabled: boolean;
    consentAt: string | null;
    lastScan: {
      status: string;
      startedAt: string | null;
      completedAt: string | null;
      attachmentsFound: number;
      errorMessage: string | null;
    } | null;
  }>;
  /** Insurance documents found and waiting for the insurance pipeline. */
  documentsFound: number;
}

export async function getInsuranceFetchStatus(userId: string): Promise<InsuranceFetchStatus> {
  const mailboxes = await prisma.mailboxAccount.findMany({
    where: { userId, provider: 'GMAIL_OAUTH', isActive: true },
    select: { id: true, googleEmail: true, insuranceFetchEnabled: true, insuranceFetchConsentAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const out: InsuranceFetchStatus['mailboxes'] = [];
  for (const mb of mailboxes) {
    const last = await prisma.gmailScanJob.findFirst({
      where: { mailboxId: mb.id, kind: 'INSURANCE' },
      orderBy: { createdAt: 'desc' },
    });
    out.push({
      mailboxId: mb.id,
      googleEmail: mb.googleEmail,
      enabled: mb.insuranceFetchEnabled,
      consentAt: mb.insuranceFetchConsentAt?.toISOString() ?? null,
      lastScan: last
        ? {
            status: last.status,
            startedAt: last.startedAt?.toISOString() ?? null,
            completedAt: last.completedAt?.toISOString() ?? null,
            attachmentsFound: last.attachmentsFound,
            errorMessage: last.errorMessage,
          }
        : null,
    });
  }
  const documentsFound = await prisma.gmailDiscoveredDoc.count({
    where: { userId, classifiedDocType: 'INSURANCE', scanJob: { kind: 'INSURANCE' } },
  });
  return { mailboxes: out, documentsFound };
}

/** Nightly: one insurance scan per mailbox that has permission. */
export async function runInsuranceFetchForAll(): Promise<{ started: number; failed: number }> {
  const enabled = await runAsSystem(() =>
    prisma.mailboxAccount.findMany({
      where: { insuranceFetchEnabled: true, isActive: true, provider: 'GMAIL_OAUTH' },
      select: { id: true, userId: true },
    }),
  );
  let started = 0;
  let failed = 0;
  for (const mb of enabled) {
    try {
      await runAsUser(mb.userId, () => startInsuranceScan(mb.userId, mb.id));
      started++;
    } catch (err) {
      failed++;
      logger.error({ err, mailboxId: mb.id }, '[insurance] nightly Gmail scan could not start');
    }
  }
  logger.info({ started, failed }, '[insurance] nightly Gmail scans started');
  return { started, failed };
}
