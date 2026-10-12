import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { writeAuditLog } from '../../lib/audit.js';
import { createLinkToken, resolveLinkToken } from './tokens.service.js';
import { decryptSecret } from '../../lib/secrets.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../notifications/email.service.js';
import { renderLegacyEmail } from './emails.js';
import { logger } from '../../lib/logger.js';
import { lockPlanClock, resetPlan, releasePlan } from './runner.service.js';
import { inactiveSince, type PlanClock } from './stateMachine.js';
import { enqueue, flushOutboxSoon } from './outbox.service.js';

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
  const fromGrace = await runAsSystem(() => runInTransaction(async (tx) => {
    const locked = await lockPlanClock(tx, t.planId);
    if (!locked || t.cycle !== locked.plan.cycle || !COUNTDOWN.has(locked.plan.status)) return null;
    const grace = locked.plan.status === 'GRACE';
    await resetPlan(tx, locked.plan, now, grace);
    return grace;
  }));
  if (fromGrace) flushOutboxSoon(t.planId);
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

/**
 * A verifier answer is only valid while the plan is still in this GRACE and
 * the owner has shown no sign of life since GRACE began — an owner who signed
 * in this morning must not be released by a click this afternoon.
 */
function verifyStillOpen(clock: PlanClock, tokenCycle: number, cycle: number): boolean {
  if (clock.status !== 'GRACE' || tokenCycle !== cycle || !clock.stageEnteredAt) return false;
  const since = inactiveSince(clock);
  return !(since && since > clock.stageEnteredAt);
}

async function liveVerifyToken(token: string, now: Date) {
  const t = await resolveLinkToken(token, 'VERIFY', now);
  if (!t || t.usedAt) return null;
  const user = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: t.userId }, select: { lastActiveAt: true } }));
  return verifyStillOpen({ ...t.plan, lastActiveAt: user.lastActiveAt }, t.cycle, t.plan.cycle) ? t : null;
}

export async function peekVerify(token: string, now: Date = new Date()): Promise<{ ownerName: string } | null> {
  const t = await liveVerifyToken(token, now);
  return t ? { ownerName: await ownerName(t.userId) } : null;
}

/** Verifier answer during GRACE: CONFIRM releases now; FINE fully resets (D9). */
export async function answerVerify(token: string, answer: 'CONFIRM' | 'FINE', now: Date = new Date()): Promise<{ ok: boolean }> {
  const t = await liveVerifyToken(token, now);
  if (!t) return { ok: false };
  const done = await runAsSystem(() => runInTransaction(async (tx) => {
    const locked = await lockPlanClock(tx, t.planId);
    if (!locked || !verifyStillOpen(locked.clock, t.cycle, locked.plan.cycle)) return false;
    const used = await tx.legacyToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: now } });
    if (used.count !== 1) return false;
    if (answer === 'CONFIRM') {
      await releasePlan(tx, locked.plan, now);
    } else {
      const p = await resetPlan(tx, locked.plan, now, true);
      await enqueue(tx, { planId: t.planId, userId: t.userId, kind: 'VERIFIER_VOUCHED_OWNER', cycle: p.cycle, recipientKey: 'owner' });
    }
    return true;
  }));
  if (!done) return { ok: false };
  flushOutboxSoon(t.planId);
  await writeAuditLog({ userId: t.userId, action: 'legacy_verifier_answer', resource: `LegacyPlan:${t.planId}`, metadata: { answer } });
  if (answer === 'CONFIRM') {
    await writeAuditLog({ userId: t.userId, action: 'legacy_released', resource: `LegacyPlan:${t.planId}`, metadata: { by: 'verifier' } });
  }
  return { ok: true };
}

/**
 * Design §7.1: a nominee whose ACCESS link expired (90 days) asks for a fresh
 * one. It is mailed only to the nominee's address on file, so holding an old
 * link gains nothing. Silent when the plan is no longer released or the link
 * belongs to an older release (revoked since), so the response reveals nothing.
 */
export async function reissueAccessLink(token: string, now: Date = new Date(), send: typeof sendEmail = sendEmail): Promise<void> {
  const t = await resolveLinkToken(token, 'ACCESS', now, { allowExpired: true });
  if (!t || !t.nomineeId || t.plan.status !== 'RELEASED' || t.cycle !== t.plan.cycle) return;
  const nomineeId = t.nomineeId;
  const n = await runAsSystem(() => prisma.legacyNominee.findUnique({ where: { id: nomineeId } }));
  if (!n) return;
  const fresh = await runAsSystem(() => runInTransaction((tx) =>
    createLinkToken(tx, { planId: t.planId, userId: t.userId, nomineeId, purpose: 'ACCESS', cycle: t.plan.cycle, now })));
  const mail = renderLegacyEmail('RELEASED_NOMINEE', {
    ownerName: await ownerName(t.userId), recipientName: decryptSecret(n.nameEnc),
    link: `${env.FRONTEND_URL}/legacy/access/${fresh}`, date: null, appUrl: env.FRONTEND_URL,
  });
  const res = await send({ to: decryptSecret(n.emailEnc), ...mail });
  if (!res.sent) logger.warn({ nomineeId, reason: res.reason }, '[legacy] access link re-issue not sent');
}
