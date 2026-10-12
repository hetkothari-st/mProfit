import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { encryptSecret, decryptSecret } from '../../lib/secrets.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../notifications/email.service.js';
import { LEGACY_STAGE_DAYS } from '@everypaisa/shared';
import { renderLegacyEmail, type OutboxKind } from './emails.js';

/**
 * Transactional outbox for Legacy Transfer mail. A state change and the rows
 * for the mail it implies commit together; flushOutbox() sends afterwards
 * and retries on the next run. So a plan can never be RELEASED with its
 * nominee mail silently lost, and a re-run never double-sends.
 */

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;
/** A claim older than this belongs to a flusher that died mid-send. */
const CLAIM_TTL_MS = 10 * MIN_MS;
/** Rows keep retrying forever (release mail must not be dropped); past this, every failure is an alert. */
const ALERT_AFTER_ATTEMPTS = 5;

/** 10 min, 20, 40, … capped at 6 h. */
export function retryDelayMs(attempts: number): number {
  return Math.min(5 * MIN_MS * 2 ** attempts, 6 * 60 * MIN_MS);
}

export const LINK_PATH: Partial<Record<OutboxKind, string>> = {
  INVITE: '/legacy/ack/',
  WARNING_1: '/legacy/ok/',
  WARNING_2: '/legacy/ok/',
  FINAL_WARNING: '/legacy/ok/',
  GRACE_OWNER: '/legacy/ok/',
  VERIFY: '/legacy/verify/',
  RELEASED_NOMINEE: '/legacy/access/',
};

export async function enqueue(
  tx: Prisma.TransactionClient,
  a: { planId: string; userId: string; kind: OutboxKind; cycle: number; recipientKey: string; token?: string },
): Promise<void> {
  await tx.legacyOutbox.upsert({
    where: { planId_kind_cycle_recipientKey: { planId: a.planId, kind: a.kind, cycle: a.cycle, recipientKey: a.recipientKey } },
    update: {}, // send-once: the first enqueue wins
    create: {
      planId: a.planId, userId: a.userId, kind: a.kind, cycle: a.cycle, recipientKey: a.recipientKey,
      tokenEnc: a.token ? encryptSecret(a.token) : null,
    },
  });
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export async function flushOutbox(
  send: typeof sendEmail = sendEmail, now: Date = new Date(), only?: { planId: string },
): Promise<{ sent: number; failed: number }> {
  const staleClaim = new Date(now.getTime() - CLAIM_TTL_MS);
  const rows = await runAsSystem(() => prisma.legacyOutbox.findMany({
    where: {
      ...(only ? { planId: only.planId } : {}),
      sentAt: null,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      AND: [{ OR: [{ claimedAt: null }, { claimedAt: { lt: staleClaim } }] }],
    },
    include: { plan: { include: { user: { select: { name: true, email: true } } } } },
    orderBy: { createdAt: 'asc' },
    take: 500,
  }));
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    // Claim the row; a concurrent flusher that read it too gets count 0 and skips.
    const claim = await runAsSystem(() => prisma.legacyOutbox.updateMany({
      where: { id: row.id, sentAt: null, claimedAt: row.claimedAt },
      data: { claimedAt: now },
    }));
    if (claim.count !== 1) continue;
    try {
      const kind = row.kind as OutboxKind;
      const owner = row.plan.user;
      let to = owner.email;
      let recipientName = owner.name;
      if (row.recipientKey !== 'owner') {
        const n = await runAsSystem(() => prisma.legacyNominee.findUnique({ where: { id: row.recipientKey } }));
        if (!n) {
          // Nominee removed after enqueue: nothing to send, and the link must not go anywhere.
          await runAsSystem(() => prisma.legacyOutbox.update({
            where: { id: row.id }, data: { sentAt: now, tokenEnc: null, claimedAt: null, lastError: 'nominee removed' },
          }));
          continue;
        }
        to = decryptSecret(n.emailEnc);
        recipientName = decryptSecret(n.nameEnc);
      }
      const path = LINK_PATH[kind];
      const link = path && row.tokenEnc ? `${env.FRONTEND_URL}${path}${decryptSecret(row.tokenEnc)}` : null;
      let date: string | null = null;
      if (kind.startsWith('SCHEDULE_') && row.plan.scheduledFor) date = fmtDate(row.plan.scheduledFor);
      if ((kind === 'GRACE_OWNER' || kind === 'GRACE_NOMINEE') && row.plan.stageEnteredAt) {
        date = fmtDate(new Date(row.plan.stageEnteredAt.getTime() + LEGACY_STAGE_DAYS * DAY_MS));
      }
      const mail = renderLegacyEmail(kind, { ownerName: owner.name, recipientName, link, date, appUrl: env.FRONTEND_URL });
      const res = await send({ to, ...mail });
      if (!res.sent) throw new Error(res.reason);
      await runAsSystem(() => prisma.legacyOutbox.update({
        where: { id: row.id }, data: { sentAt: now, tokenEnc: null, claimedAt: null },
      }));
      sent++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      const attempts = row.attempts + 1;
      await runAsSystem(() => prisma.legacyOutbox.update({
        where: { id: row.id },
        data: {
          attempts, lastError: msg.slice(0, 500), claimedAt: null,
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
        },
      }));
      const log = { outboxId: row.id, kind: row.kind, attempts, err: msg };
      if (attempts >= ALERT_AFTER_ATTEMPTS) logger.error(log, '[legacy] ALERT: outbox mail still failing; retrying with backoff');
      else logger.warn(log, '[legacy] outbox send failed; will retry');
    }
  }
  return { sent, failed };
}

/**
 * For request handlers: send this plan's mail in the background, so a request
 * never waits on SMTP or sends other owners' mail. The hourly cron covers the rest.
 */
export function flushOutboxSoon(planId: string): void {
  flushOutbox(sendEmail, new Date(), { planId }).catch((err: unknown) => {
    // Background path: the hourly cron flush retries anything left.
    logger.error({ err: err instanceof Error ? err.message : String(err) }, '[legacy] background outbox flush failed');
  });
}
