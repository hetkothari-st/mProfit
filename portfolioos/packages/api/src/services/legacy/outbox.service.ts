import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { encryptSecret, decryptSecret } from '../../lib/secrets.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../notifications/email.service.js';
import { renderLegacyEmail, type OutboxKind } from './emails.js';

/**
 * Transactional outbox for Legacy Transfer mail. A state change and the rows
 * for the mail it implies commit together; flushOutbox() sends afterwards
 * and retries on the next run. So a plan can never be RELEASED with its
 * nominee mail silently lost, and a re-run never double-sends.
 */

const MAX_ATTEMPTS = 5;
const DAY_MS = 86_400_000;

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

export async function flushOutbox(send: typeof sendEmail = sendEmail): Promise<{ sent: number; failed: number }> {
  const rows = await runAsSystem(() => prisma.legacyOutbox.findMany({
    where: { sentAt: null, attempts: { lt: MAX_ATTEMPTS } },
    include: { plan: { include: { user: { select: { name: true, email: true } } } } },
    orderBy: { createdAt: 'asc' },
    take: 500,
  }));
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
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
            where: { id: row.id }, data: { sentAt: new Date(), tokenEnc: null, lastError: 'nominee removed' },
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
        date = fmtDate(new Date(row.plan.stageEnteredAt.getTime() + 7 * DAY_MS));
      }
      const mail = renderLegacyEmail(kind, { ownerName: owner.name, recipientName, link, date, appUrl: env.FRONTEND_URL });
      const res = await send({ to, ...mail });
      if (!res.sent) throw new Error(res.reason);
      await runAsSystem(() => prisma.legacyOutbox.update({ where: { id: row.id }, data: { sentAt: new Date(), tokenEnc: null } }));
      sent++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      await runAsSystem(() => prisma.legacyOutbox.update({
        where: { id: row.id }, data: { attempts: { increment: 1 }, lastError: msg.slice(0, 500) },
      }));
      logger.error({ outboxId: row.id, kind: row.kind, err: msg }, '[legacy] outbox send failed; will retry');
    }
  }
  return { sent, failed };
}
