import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { writeAuditLog } from '../../lib/audit.js';
import { resolveLinkToken } from './tokens.service.js';
import { resetPlan, releasePlan } from './runner.service.js';
import { enqueue, flushOutbox } from './outbox.service.js';

/**
 * Actions reached from emailed links, with no login. The link token is the
 * whole credential, so each action does only what that link promised.
 */

const COUNTDOWN = new Set(['WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE']);

const ownerName = (userId: string) =>
  runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } })).then((u) => u.name);

/** Owner's one-click "I'm OK": counts as activity and stops any countdown in progress. */
export async function imOk(token: string, now: Date = new Date()): Promise<{ ok: boolean }> {
  const t = await resolveLinkToken(token, 'IM_OK', now);
  if (!t) return { ok: false };
  await runAsSystem(() => prisma.user.update({ where: { id: t.userId }, data: { lastActiveAt: now } }));
  // An old cycle's link still records activity but must not reset a newer countdown stage.
  if (t.cycle === t.plan.cycle && COUNTDOWN.has(t.plan.status)) {
    const fromGrace = t.plan.status === 'GRACE';
    await runAsSystem(() => runInTransaction((tx) => resetPlan(tx, t.plan, now, fromGrace)));
    if (fromGrace) await flushOutbox();
  }
  await writeAuditLog({ userId: t.userId, action: 'legacy_im_ok', resource: `LegacyPlan:${t.planId}` });
  return { ok: true };
}

export async function acknowledgeInvite(token: string, now: Date = new Date()): Promise<{ ownerName: string } | null> {
  const t = await resolveLinkToken(token, 'INVITE', now);
  if (!t || !t.nomineeId) return null;
  const nomineeId = t.nomineeId;
  await runAsSystem(() => prisma.legacyNominee.update({ where: { id: nomineeId }, data: { acknowledgedAt: now } }));
  return { ownerName: await ownerName(t.userId) };
}

async function liveVerifyToken(token: string, now: Date) {
  const t = await resolveLinkToken(token, 'VERIFY', now);
  if (!t || t.usedAt || t.plan.status !== 'GRACE' || t.cycle !== t.plan.cycle) return null;
  return t;
}

export async function peekVerify(token: string, now: Date = new Date()): Promise<{ ownerName: string } | null> {
  const t = await liveVerifyToken(token, now);
  return t ? { ownerName: await ownerName(t.userId) } : null;
}

/** Verifier answer during GRACE: CONFIRM releases now; FINE fully resets (D9). */
export async function answerVerify(token: string, answer: 'CONFIRM' | 'FINE', now: Date = new Date()): Promise<{ ok: boolean }> {
  const t = await liveVerifyToken(token, now);
  if (!t) return { ok: false };
  await runAsSystem(() => runInTransaction(async (tx) => {
    await tx.legacyToken.update({ where: { id: t.id }, data: { usedAt: now } });
    if (answer === 'CONFIRM') {
      await releasePlan(tx, t.plan, now);
    } else {
      const p = await resetPlan(tx, t.plan, now, true);
      await enqueue(tx, { planId: t.planId, userId: t.userId, kind: 'VERIFIER_VOUCHED_OWNER', cycle: p.cycle, recipientKey: 'owner' });
    }
  }));
  await flushOutbox();
  await writeAuditLog({ userId: t.userId, action: 'legacy_verifier_answer', resource: `LegacyPlan:${t.planId}`, metadata: { answer } });
  if (answer === 'CONFIRM') {
    await writeAuditLog({ userId: t.userId, action: 'legacy_released', resource: `LegacyPlan:${t.planId}`, metadata: { by: 'verifier' } });
  }
  return { ok: true };
}
