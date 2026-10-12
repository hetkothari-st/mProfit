import {
  LEGACY_SCHEDULE_REMINDER_DAYS, LEGACY_STAGE_DAYS,
  type LegacyStatusValue, type LegacyTriggerValue,
} from '@everypaisa/shared';

/**
 * Legacy Transfer plan state machine (design §6). Pure: given a plan's clock
 * fields and "now", say what should happen. The runner applies the steps;
 * keeping the decision here makes every transition table-testable.
 */

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 3_600_000;

export interface PlanClock {
  status: LegacyStatusValue;
  triggerMode: LegacyTriggerValue;
  inactivityDays: number;
  scheduledFor: Date | null;
  pausedUntil: Date | null;
  stageEnteredAt: Date | null;
  clockResetAt: Date | null;
  lastActiveAt: Date | null;
  /** Admin-only test mode: inactivity and every stage last 1 minute instead of days. */
  testMode: boolean;
}

const MIN_MS = 60_000;
export const TEST_MODE_MINUTES = 1;

export type Step =
  | { kind: 'reset'; from: LegacyStatusValue }
  | { kind: 'resume' }
  | { kind: 'advance'; to: LegacyStatusValue; reason: 'inactivity' | 'scheduled' }
  | { kind: 'scheduleReminder'; daysBefore: 30 | 7 | 1 };

const COUNTDOWN: ReadonlySet<LegacyStatusValue> = new Set(['WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE']);
const NEXT: Partial<Record<LegacyStatusValue, LegacyStatusValue>> = {
  WARNING_1: 'WARNING_2', WARNING_2: 'FINAL_WARNING', FINAL_WARNING: 'GRACE', GRACE: 'RELEASED',
};

/** IST calendar-day start as a UTC instant; days are counted in IST like every other cron here. */
function istDayStart(d: Date): number {
  return Math.floor((d.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}
function daysBetween(from: Date, to: Date): number {
  return Math.round((istDayStart(to) - istDayStart(from)) / DAY_MS);
}

/** Whole units elapsed: IST calendar days normally, minutes in test mode. */
function elapsed(p: PlanClock, from: Date, to: Date): number {
  return p.testMode ? Math.floor((to.getTime() - from.getTime()) / MIN_MS) : daysBetween(from, to);
}
const inactivityUnits = (p: PlanClock) => (p.testMode ? TEST_MODE_MINUTES : p.inactivityDays);
const stageUnits = (p: PlanClock) => (p.testMode ? TEST_MODE_MINUTES : LEGACY_STAGE_DAYS);

export function inactiveSince(p: PlanClock): Date | null {
  const c = [p.lastActiveAt, p.clockResetAt].filter((d): d is Date => d !== null);
  if (c.length === 0) return null;
  return new Date(Math.max(...c.map((d) => d.getTime())));
}

const usesSchedule = (t: LegacyTriggerValue) => t === 'SCHEDULED' || t === 'BOTH';
const usesInactivity = (t: LegacyTriggerValue) => t === 'INACTIVITY' || t === 'BOTH';

export function planSteps(p: PlanClock, now: Date): Step[] {
  if (p.status === 'DRAFT' || p.status === 'RELEASED') return [];
  if (p.status === 'PAUSED') {
    return p.pausedUntil && daysBetween(p.pausedUntil, now) >= 0 ? [{ kind: 'resume' }] : [];
  }
  const since = inactiveSince(p);
  // Activity always wins: checked before any advance, including a scheduled release.
  if (COUNTDOWN.has(p.status) && since && p.stageEnteredAt && since > p.stageEnteredAt) {
    return [{ kind: 'reset', from: p.status }];
  }
  if (usesSchedule(p.triggerMode) && p.scheduledFor && daysBetween(now, p.scheduledFor) <= 0) {
    return [{ kind: 'advance', to: 'RELEASED', reason: 'scheduled' }];
  }
  const steps: Step[] = [];
  if (usesSchedule(p.triggerMode) && p.scheduledFor) {
    const left = daysBetween(now, p.scheduledFor);
    const t = [...LEGACY_SCHEDULE_REMINDER_DAYS].sort((a, b) => a - b).find((d) => left <= d);
    if (t !== undefined) steps.push({ kind: 'scheduleReminder', daysBefore: t });
  }
  if (usesInactivity(p.triggerMode)) {
    const next = NEXT[p.status];
    if (p.status === 'ARMED' && since && elapsed(p, since, now) >= inactivityUnits(p)) {
      steps.push({ kind: 'advance', to: 'WARNING_1', reason: 'inactivity' });
    } else if (next && p.stageEnteredAt && elapsed(p, p.stageEnteredAt, now) >= stageUnits(p)) {
      steps.push({ kind: 'advance', to: next, reason: 'inactivity' });
    }
  }
  return steps;
}

const fmt = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

/** One sentence for the owner's status card. */
export function nextEventText(p: PlanClock, _now: Date): string | null {
  if (p.testMode && p.status !== 'DRAFT' && p.status !== 'RELEASED' && p.status !== 'PAUSED') {
    return 'Test mode: after 1 minute of inactivity, each reminder stage lasts 1 minute (release in about 5 minutes).';
  }
  switch (p.status) {
    case 'DRAFT':
      return null;
    case 'RELEASED':
      return 'Your nominees have access. Revoke it any time.';
    case 'PAUSED':
      return p.pausedUntil ? `Paused until ${fmt(p.pausedUntil)}.` : 'Paused.';
    case 'GRACE':
      return p.stageEnteredAt
        ? `Nominees get access on ${fmt(addDays(p.stageEnteredAt, LEGACY_STAGE_DAYS))} unless you sign in.`
        : null;
    case 'WARNING_1':
    case 'WARNING_2':
    case 'FINAL_WARNING':
      return 'Reminders are being sent. Sign in or click "I\'m OK" in the email to reset.';
    case 'ARMED': {
      const parts: string[] = [];
      const since = inactiveSince(p);
      if (usesInactivity(p.triggerMode) && since) {
        parts.push(`First warning on ${fmt(addDays(since, p.inactivityDays))} if you stay inactive.`);
      }
      if (usesSchedule(p.triggerMode) && p.scheduledFor) parts.push(`Scheduled release on ${fmt(p.scheduledFor)}.`);
      return parts.join(' ') || null;
    }
  }
}
