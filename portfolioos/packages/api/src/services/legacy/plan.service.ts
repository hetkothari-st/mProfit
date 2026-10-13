import type { LegacyNominee, LegacyPlan } from '@prisma/client';
import {
  LEGACY_MAX_PAUSE_DAYS, type LegacyCategory, type LegacyNomineeDTO, type LegacyOverviewDTO,
} from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { encryptSecret, decryptSecret } from '../../lib/secrets.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../notifications/email.service.js';
import {
  legacyNomineeSchema, legacySettingsSchema, type LegacyNomineeInput, type LegacySettingsInput,
} from '../../schemas/legacy.schemas.js';
import { nextEventText } from './stateMachine.js';
import { createLinkToken, wipeNomineeAccess } from './tokens.service.js';
import { enqueue, flushOutboxSoon } from './outbox.service.js';
import { renderPlanChangedEmail } from './emails.js';

/**
 * Owner-side Legacy Transfer operations. Callers run under the owner's
 * request context, so plan/nominee reads and writes are RLS-scoped to them.
 * Entitlement is enforced at the route (requireFeature) — this layer only
 * enforces the plan's own rules.
 */

const MAX_NOMINEES = 10;
const DAY = 86_400_000;
const EDITABLE: ReadonlySet<LegacyPlan['status']> = new Set(['DRAFT', 'ARMED', 'PAUSED']);
const PAUSABLE: ReadonlySet<LegacyPlan['status']> = new Set(['ARMED', 'WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE']);

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
/** Today's calendar date in IST — the state machine counts IST days too. */
const todayIso = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/**
 * A release date that has already passed must not survive a re-arm: the next
 * tick would release again straight away (scheduled release has no grace).
 * Re-arming falls back to inactivity until the owner picks a new date.
 */
function dropPassedSchedule(plan: LegacyPlan): { triggerMode?: 'INACTIVITY'; scheduledFor?: null } {
  if (plan.triggerMode === 'INACTIVITY' || !plan.scheduledFor) return {};
  return dateOnly(plan.scheduledFor)! <= todayIso() ? { triggerMode: 'INACTIVITY', scheduledFor: null } : {};
}

/** Creates the DRAFT row on first touch. */
function ensurePlan(userId: string): Promise<LegacyPlan> {
  return prisma.legacyPlan.upsert({ where: { userId }, update: {}, create: { userId } });
}

function toNomineeDTO(n: LegacyNominee): LegacyNomineeDTO {
  return {
    id: n.id,
    name: decryptSecret(n.nameEnc),
    email: decryptSecret(n.emailEnc),
    relationship: n.relationship,
    priority: n.priority,
    isVerifier: n.isVerifier,
    categories: n.categories as LegacyCategory[],
    documentIds: n.documentIds,
    showAmounts: n.showAmounts,
    acknowledgedAt: n.acknowledgedAt?.toISOString() ?? null,
  };
}

export async function getOverview(userId: string, entitled: boolean): Promise<LegacyOverviewDTO> {
  const plan = await ensurePlan(userId);
  const nominees = await prisma.legacyNominee.findMany({ where: { planId: plan.id }, orderBy: { priority: 'asc' } });
  const user = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { lastActiveAt: true } }));
  return {
    status: plan.status,
    triggerMode: plan.triggerMode,
    inactivityDays: plan.inactivityDays,
    testMode: plan.testMode,
    scheduledFor: dateOnly(plan.scheduledFor),
    pausedUntil: dateOnly(plan.pausedUntil),
    hasLetter: plan.letterEnc !== null,
    letter: plan.letterEnc ? decryptSecret(plan.letterEnc) : null,
    activatedAt: plan.activatedAt?.toISOString() ?? null,
    releasedAt: plan.releasedAt?.toISOString() ?? null,
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
    nextEvent: nextEventText({ ...plan, lastActiveAt: user.lastActiveAt }, new Date()),
    nominees: nominees.map(toNomineeDTO),
    entitled,
  };
}

export async function saveSettings(userId: string, raw: LegacySettingsInput, opts: { isAdmin: boolean }): Promise<void> {
  const input = legacySettingsSchema.parse(raw);
  if (input.testMode) {
    // Test mode can release someone's finances in ~5 minutes: admins only, server-enforced.
    if (!opts.isAdmin) throw new ForbiddenError('Test mode is for admins only.');
    if (input.triggerMode !== 'INACTIVITY') throw new BadRequestError('Test mode works with the inactivity trigger only.');
  }
  if (input.triggerMode !== 'INACTIVITY') {
    if (!input.scheduledFor) throw new BadRequestError('Pick a release date.');
    if (input.scheduledFor <= todayIso()) throw new BadRequestError('The release date must be in the future.');
  }
  const plan = await ensurePlan(userId);
  if (!EDITABLE.has(plan.status)) {
    throw new BadRequestError('The plan is counting down or released. Pause or revoke it first.');
  }
  await prisma.legacyPlan.update({
    where: { id: plan.id },
    data: {
      triggerMode: input.triggerMode,
      inactivityDays: input.inactivityDays,
      testMode: input.testMode,
      scheduledFor: input.triggerMode === 'INACTIVITY' ? null : new Date(`${input.scheduledFor}T00:00:00Z`),
      letterEnc: input.letter ? encryptSecret(input.letter) : null,
      ...(plan.status === 'ARMED' && (plan.inactivityDays !== input.inactivityDays || plan.testMode !== input.testMode)
        ? { clockResetAt: new Date() } : {}),
    },
  });
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyPlan:${plan.id}`, metadata: { what: 'settings' } });
}

/**
 * The documents a nominee keeps. An id that no longer exists (a file deleted, a
 * will's signed copy replaced) is dropped so the owner can still save; an id
 * that belongs to another user is refused.
 */
async function keptDocumentIds(userId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const found = await runAsSystem(() =>
    prisma.document.findMany({ where: { id: { in: unique } }, select: { id: true, userId: true } }),
  );
  if (found.some((d) => d.userId !== userId)) throw new BadRequestError('One of the documents was not found.');
  const existing = new Set(found.map((d) => d.id));
  return unique.filter((id) => existing.has(id));
}

/** Checks the nominee and returns the document ids to store. */
async function validateNominee(userId: string, planId: string, input: LegacyNomineeInput, selfId?: string): Promise<string[]> {
  const others = await prisma.legacyNominee.findMany({ where: { planId, ...(selfId ? { id: { not: selfId } } : {}) } });
  if (!selfId && others.length >= MAX_NOMINEES) throw new BadRequestError(`You can add up to ${MAX_NOMINEES} nominees.`);
  if (others.some((n) => decryptSecret(n.emailEnc).toLowerCase() === input.email)) {
    throw new BadRequestError('This email is already a nominee.');
  }
  return keptDocumentIds(userId, input.documentIds);
}

/** Invite a nominee on a live plan; on an already-released plan, also hand them access. */
async function inviteIfLive(planId: string, nomineeId: string): Promise<void> {
  const queued = await runAsSystem(() => runInTransaction(async (tx) => {
    const plan = await tx.legacyPlan.findUniqueOrThrow({ where: { id: planId } });
    if (plan.status === 'DRAFT') return false;
    const now = new Date();
    const inv = await createLinkToken(tx, { planId, userId: plan.userId, nomineeId, purpose: 'INVITE', cycle: plan.cycle, now });
    await enqueue(tx, { planId, userId: plan.userId, kind: 'INVITE', cycle: plan.cycle, recipientKey: nomineeId, token: inv });
    if (plan.status === 'RELEASED') {
      const acc = await createLinkToken(tx, { planId, userId: plan.userId, nomineeId, purpose: 'ACCESS', cycle: plan.cycle, now });
      await enqueue(tx, { planId, userId: plan.userId, kind: 'RELEASED_NOMINEE', cycle: plan.cycle, recipientKey: nomineeId, token: acc });
    }
    return true;
  }));
  if (queued) flushOutboxSoon(planId);
}

export async function addNominee(userId: string, raw: LegacyNomineeInput): Promise<LegacyNomineeDTO> {
  const input = legacyNomineeSchema.parse(raw);
  const plan = await ensurePlan(userId);
  const documentIds = await validateNominee(userId, plan.id, input);
  if (input.isVerifier) await prisma.legacyNominee.updateMany({ where: { planId: plan.id }, data: { isVerifier: false } });
  const n = await prisma.legacyNominee.create({
    data: {
      planId: plan.id, userId,
      nameEnc: encryptSecret(input.name), emailEnc: encryptSecret(input.email),
      relationship: input.relationship, priority: input.priority, isVerifier: input.isVerifier,
      categories: input.categories, documentIds, showAmounts: input.showAmounts,
    },
  });
  await inviteIfLive(plan.id, n.id);
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyNominee:${n.id}`, metadata: { what: 'nominee_added' } });
  return toNomineeDTO(n);
}

export async function updateNominee(userId: string, nomineeId: string, raw: LegacyNomineeInput): Promise<LegacyNomineeDTO> {
  const input = legacyNomineeSchema.parse(raw);
  const plan = await ensurePlan(userId);
  const existing = await prisma.legacyNominee.findFirst({ where: { id: nomineeId, planId: plan.id } });
  if (!existing) throw new NotFoundError('Nominee not found');
  const documentIds = await validateNominee(userId, plan.id, input, nomineeId);
  if (input.isVerifier) {
    await prisma.legacyNominee.updateMany({ where: { planId: plan.id, id: { not: nomineeId } }, data: { isVerifier: false } });
  }
  const emailChanged = decryptSecret(existing.emailEnc).toLowerCase() !== input.email;
  const n = await prisma.legacyNominee.update({
    where: { id: nomineeId },
    data: {
      nameEnc: encryptSecret(input.name), emailEnc: encryptSecret(input.email), relationship: input.relationship,
      priority: input.priority, isVerifier: input.isVerifier, categories: input.categories,
      documentIds, showAmounts: input.showAmounts,
      ...(emailChanged ? { acknowledgedAt: null } : {}),
    },
  });
  if (emailChanged) {
    // A new address must not inherit links or sessions issued to the old one.
    await runAsSystem(async () => {
      await prisma.legacyToken.deleteMany({ where: { nomineeId } });
      await prisma.legacyCode.deleteMany({ where: { nomineeId } });
      await prisma.legacyOutbox.deleteMany({ where: { planId: plan.id, recipientKey: nomineeId, sentAt: null } });
    });
    await inviteIfLive(plan.id, nomineeId);
  }
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyNominee:${nomineeId}`, metadata: { what: 'nominee_updated' } });
  return toNomineeDTO(n);
}

/** Cascades to the nominee's tokens and codes, so any open session ends immediately. */
export async function removeNominee(userId: string, nomineeId: string): Promise<void> {
  const plan = await ensurePlan(userId);
  const res = await prisma.legacyNominee.deleteMany({ where: { id: nomineeId, planId: plan.id } });
  if (res.count === 0) throw new NotFoundError('Nominee not found');
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyNominee:${nomineeId}`, metadata: { what: 'nominee_removed' } });
}

export async function activate(userId: string): Promise<void> {
  const plan = await ensurePlan(userId);
  if (plan.status !== 'DRAFT') throw new BadRequestError('The plan is already on.');
  const nominees = await prisma.legacyNominee.findMany({ where: { planId: plan.id } });
  if (nominees.length === 0) throw new BadRequestError('Add at least one nominee first.');
  if (plan.triggerMode !== 'INACTIVITY' && (!plan.scheduledFor || dateOnly(plan.scheduledFor)! <= todayIso())) {
    throw new BadRequestError('Pick a future release date first.');
  }
  const now = new Date();
  await prisma.legacyPlan.update({ where: { id: plan.id }, data: { status: 'ARMED', activatedAt: now, clockResetAt: now } });
  for (const n of nominees.filter((x) => !x.acknowledgedAt)) await inviteIfLive(plan.id, n.id);
  await writeAuditLog({ userId, action: 'legacy_activated', resource: `LegacyPlan:${plan.id}` });
}

export async function pause(userId: string, until: string): Promise<void> {
  const plan = await ensurePlan(userId);
  if (!PAUSABLE.has(plan.status)) throw new BadRequestError('Only an active plan can be paused.');
  const max = new Date(Date.now() + LEGACY_MAX_PAUSE_DAYS * DAY).toISOString().slice(0, 10);
  if (until <= todayIso() || until > max) throw new BadRequestError(`Pause for up to ${LEGACY_MAX_PAUSE_DAYS} days.`);
  const wasGrace = plan.status === 'GRACE';
  await runAsSystem(() => runInTransaction(async (tx) => {
    const p = await tx.legacyPlan.update({
      where: { id: plan.id },
      data: { status: 'PAUSED', pausedUntil: new Date(`${until}T00:00:00Z`), stageEnteredAt: null, cycle: { increment: 1 } },
    });
    await tx.legacyToken.deleteMany({ where: { planId: plan.id, purpose: { in: ['IM_OK', 'VERIFY'] } } });
    if (wasGrace) {
      for (const n of await tx.legacyNominee.findMany({ where: { planId: plan.id } })) {
        await enqueue(tx, { planId: plan.id, userId, kind: 'RESET_NOMINEE', cycle: p.cycle, recipientKey: n.id });
      }
    }
  }));
  if (wasGrace) flushOutboxSoon(plan.id);
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyPlan:${plan.id}`, metadata: { what: 'paused', until } });
}

export async function resume(userId: string): Promise<void> {
  const plan = await ensurePlan(userId);
  if (plan.status !== 'PAUSED') throw new BadRequestError('The plan is not paused.');
  await prisma.legacyPlan.update({
    where: { id: plan.id },
    data: { status: 'ARMED', pausedUntil: null, clockResetAt: new Date(), cycle: { increment: 1 }, ...dropPassedSchedule(plan) },
  });
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyPlan:${plan.id}`, metadata: { what: 'resumed' } });
}

/** Back to DRAFT: every link and session for the plan stops working. */
export async function deactivate(userId: string): Promise<void> {
  const plan = await ensurePlan(userId);
  await runAsSystem(() => runInTransaction(async (tx) => {
    await wipeNomineeAccess(tx, plan.id);
    await tx.legacyToken.deleteMany({ where: { planId: plan.id } });
    await tx.legacyPlan.update({
      where: { id: plan.id },
      data: { status: 'DRAFT', stageEnteredAt: null, releasedAt: null, pausedUntil: null, cycle: { increment: 1 } },
    });
  }));
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyPlan:${plan.id}`, metadata: { what: 'deactivated' } });
}

/** Withdraw access after release: from everyone (plan re-arms) or from one nominee. */
export async function revoke(userId: string, nomineeId?: string): Promise<void> {
  const plan = await ensurePlan(userId);
  if (plan.status !== 'RELEASED') throw new BadRequestError('Nothing has been shared yet.');
  await runAsSystem(() => runInTransaction(async (tx) => {
    const targets = await tx.legacyNominee.findMany({ where: { planId: plan.id, ...(nomineeId ? { id: nomineeId } : {}) } });
    if (nomineeId && targets.length === 0) throw new NotFoundError('Nominee not found');
    let cycle = plan.cycle;
    if (nomineeId) {
      await tx.legacyToken.deleteMany({ where: { nomineeId, purpose: 'ACCESS' } });
      await tx.legacyCode.deleteMany({ where: { nomineeId } });
    } else {
      await wipeNomineeAccess(tx, plan.id);
      const p = await tx.legacyPlan.update({
        where: { id: plan.id },
        data: {
          status: 'ARMED', releasedAt: null, stageEnteredAt: null, clockResetAt: new Date(), cycle: { increment: 1 },
          ...dropPassedSchedule(plan),
        },
      });
      cycle = p.cycle;
    }
    for (const n of targets) await enqueue(tx, { planId: plan.id, userId, kind: 'REVOKED_NOMINEE', cycle, recipientKey: n.id });
  }));
  flushOutboxSoon(plan.id);
  await writeAuditLog({ userId, action: 'legacy_revoked', resource: `LegacyPlan:${plan.id}`, metadata: { nomineeId: nomineeId ?? 'all' } });
}

/** Security notice to the owner after any change; best-effort. */
export async function notifyPlanChanged(userId: string): Promise<void> {
  try {
    const u = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }));
    const res = await sendEmail({ to: u.email, ...renderPlanChangedEmail(u.name, env.FRONTEND_URL) });
    if (!res.sent) logger.warn({ userId, reason: res.reason }, '[legacy] plan-changed email not sent');
  } catch (err) {
    // Best-effort security notice: the change itself already succeeded and is audited.
    logger.error({ userId, err: err instanceof Error ? err.message : String(err) }, '[legacy] plan-changed email failed');
  }
}
