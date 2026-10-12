import type { LegacyPlan, Prisma } from '@prisma/client';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { logger } from '../../lib/logger.js';
import { writeAuditLog, type AuditAction } from '../../lib/audit.js';
import type { sendEmail } from '../notifications/email.service.js';
import { planSteps, type PlanClock, type Step } from './stateMachine.js';
import { createLinkToken } from './tokens.service.js';
import { enqueue, flushOutbox } from './outbox.service.js';
import type { OutboxKind } from './emails.js';

/**
 * Applies planSteps() to stored plans. Each step's writes and the mail it
 * implies commit in one transaction (outbox); sending happens after commit.
 * Plan status alone drives everything — the owner's subscription is never
 * consulted, so a plan armed while premium still releases after a lapse.
 */

type Tx = Prisma.TransactionClient;

function nomineesOf(tx: Tx, planId: string) {
  return tx.legacyNominee.findMany({ where: { planId }, orderBy: { priority: 'asc' } });
}

async function ownerMail(tx: Tx, plan: LegacyPlan, kind: OutboxKind, now: Date, withImOk: boolean): Promise<void> {
  const token = withImOk
    ? await createLinkToken(tx, { planId: plan.id, userId: plan.userId, nomineeId: null, purpose: 'IM_OK', cycle: plan.cycle, now })
    : undefined;
  await enqueue(tx, { planId: plan.id, userId: plan.userId, kind, cycle: plan.cycle, recipientKey: 'owner', token });
}

/** Back to ARMED with a fresh cycle; inactivity is measured from now. Used by the cron, I'm OK and the verifier. */
export async function resetPlan(tx: Tx, plan: LegacyPlan, now: Date, notifyNominees: boolean): Promise<LegacyPlan> {
  const updated = await tx.legacyPlan.update({
    where: { id: plan.id },
    data: { status: 'ARMED', stageEnteredAt: null, clockResetAt: now, cycle: { increment: 1 } },
  });
  await tx.legacyToken.deleteMany({ where: { planId: plan.id, purpose: { in: ['IM_OK', 'VERIFY'] } } });
  if (notifyNominees) {
    for (const n of await nomineesOf(tx, plan.id)) {
      await enqueue(tx, { planId: plan.id, userId: plan.userId, kind: 'RESET_NOMINEE', cycle: updated.cycle, recipientKey: n.id });
    }
  }
  return updated;
}

/** Open access: every nominee (acknowledged or not) gets an ACCESS link. */
export async function releasePlan(tx: Tx, plan: LegacyPlan, now: Date): Promise<void> {
  await tx.legacyPlan.update({ where: { id: plan.id }, data: { status: 'RELEASED', stageEnteredAt: now, releasedAt: now } });
  await tx.legacyToken.deleteMany({ where: { planId: plan.id, purpose: { in: ['IM_OK', 'VERIFY'] } } });
  for (const n of await nomineesOf(tx, plan.id)) {
    const token = await createLinkToken(tx, { planId: plan.id, userId: plan.userId, nomineeId: n.id, purpose: 'ACCESS', cycle: plan.cycle, now });
    await enqueue(tx, { planId: plan.id, userId: plan.userId, kind: 'RELEASED_NOMINEE', cycle: plan.cycle, recipientKey: n.id, token });
  }
  await ownerMail(tx, plan, 'RELEASED_OWNER', now, false);
}

async function advance(tx: Tx, plan: LegacyPlan, to: PlanClock['status'], now: Date): Promise<void> {
  if (to === 'RELEASED') return releasePlan(tx, plan, now);
  const p = await tx.legacyPlan.update({ where: { id: plan.id }, data: { status: to, stageEnteredAt: now } });
  if (to === 'GRACE') {
    await ownerMail(tx, p, 'GRACE_OWNER', now, true);
    for (const n of await nomineesOf(tx, p.id)) {
      await enqueue(tx, { planId: p.id, userId: p.userId, kind: 'GRACE_NOMINEE', cycle: p.cycle, recipientKey: n.id });
      if (n.isVerifier) {
        const token = await createLinkToken(tx, { planId: p.id, userId: p.userId, nomineeId: n.id, purpose: 'VERIFY', cycle: p.cycle, now });
        await enqueue(tx, { planId: p.id, userId: p.userId, kind: 'VERIFY', cycle: p.cycle, recipientKey: n.id, token });
      }
    }
    return;
  }
  if (to === 'WARNING_1' || to === 'WARNING_2' || to === 'FINAL_WARNING') {
    await ownerMail(tx, p, to, now, true);
    return;
  }
  throw new Error(`legacy: cannot advance to ${to}`);
}

function auditFor(step: Step): AuditAction | null {
  if (step.kind === 'reset') return 'legacy_reset';
  if (step.kind === 'advance') return step.to === 'RELEASED' ? 'legacy_released' : 'legacy_warning';
  return null;
}

export async function applyStep(planId: string, step: Step, now: Date): Promise<void> {
  const plan = await runAsSystem(() => runInTransaction(async (tx) => {
    const p = await tx.legacyPlan.findUniqueOrThrow({ where: { id: planId } });
    switch (step.kind) {
      case 'reset':
        await resetPlan(tx, p, now, step.from === 'GRACE');
        break;
      case 'resume':
        await tx.legacyPlan.update({
          where: { id: p.id },
          data: { status: 'ARMED', pausedUntil: null, clockResetAt: now, cycle: { increment: 1 } },
        });
        break;
      case 'scheduleReminder':
        await ownerMail(tx, p, `SCHEDULE_${step.daysBefore}`, now, false);
        break;
      case 'advance':
        await advance(tx, p, step.to, now);
        break;
    }
    return p;
  }));
  const action = auditFor(step);
  if (action) await writeAuditLog({ userId: plan.userId, action, resource: `LegacyPlan:${planId}`, metadata: { step } });
}

export async function runLegacyTick(
  now: Date = new Date(), send?: typeof sendEmail,
): Promise<{ plans: number; steps: number; sent: number; failed: number }> {
  const plans = await runAsSystem(() => prisma.legacyPlan.findMany({
    where: { status: { notIn: ['DRAFT', 'RELEASED'] } },
    include: { user: { select: { lastActiveAt: true } } },
  }));
  let steps = 0;
  for (const p of plans) {
    const clock: PlanClock = {
      status: p.status, triggerMode: p.triggerMode, inactivityDays: p.inactivityDays, scheduledFor: p.scheduledFor,
      pausedUntil: p.pausedUntil, stageEnteredAt: p.stageEnteredAt, clockResetAt: p.clockResetAt,
      lastActiveAt: p.user.lastActiveAt,
    };
    for (const step of planSteps(clock, now)) {
      try {
        await applyStep(p.id, step, now);
        steps++;
      } catch (err) {
        // One bad plan must not stop the others; the next tick retries it.
        logger.error({ planId: p.id, step, err: err instanceof Error ? err.message : String(err) }, '[legacy] step failed');
      }
    }
  }
  const { sent, failed } = await flushOutbox(send);
  return { plans: plans.length, steps, sent, failed };
}
