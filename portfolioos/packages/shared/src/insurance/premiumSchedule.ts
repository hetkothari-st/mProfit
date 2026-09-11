/**
 * Insurance premium schedule — the one place that decides when premiums fall
 * due, which are paid, and whether a policy is due soon, in its grace period,
 * or at risk of lapsing. Used by the API (to keep `nextPremiumDue` right for
 * reminders) and by the web app (to show the schedule), so the two can't
 * disagree.
 *
 * Dates are ISO `YYYY-MM-DD` strings (full timestamps are accepted and cut to
 * the date). Every due date is counted from the start date — not from the
 * previous due date — so a policy that starts on the 31st isn't pulled to the
 * 28th for good after February.
 */
import { Decimal } from '../decimal.js';

export type PremiumFrequency = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL' | 'SINGLE';

/** Months between premiums; a single premium has no schedule. */
export const PREMIUM_FREQUENCY_MONTHS: Readonly<Record<string, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  ANNUAL: 12,
};

/** A premium due within this many days is "due soon". */
export const DUE_SOON_DAYS = 30;

/**
 * The basis for `defaultGraceDays`, shown next to it in the app. A policy's
 * own wording can differ; users can override the grace period per policy.
 */
export const GRACE_PERIOD_BASIS = {
  summary:
    'Policies paid in instalments give 30 days to pay a missed premium (15 days if you pay monthly), ' +
    'and cover continues meanwhile. For other policies we don’t assume any grace — renew before the due date.',
  asOf: '2026-09-11',
  source: {
    label: "IRDAI Master Circular on Protection of Policyholders' Interests, 2024",
    url: 'https://irdai.gov.in/document-detail?documentId=5625747',
    where: 'pages 13–14 (life); health: IRDAI Master Circular on Health Insurance Business 2024, para 8',
  },
} as const;

const DAY_MS = 86_400_000;
const LIFE_OR_HEALTH = new Set(['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT', 'HEALTH']);

const int = (s: string) => Number.parseInt(s, 10);
const pad = (n: number) => String(n).padStart(2, '0');
const iso10 = (s: string) => s.slice(0, 10);
const utc = (iso: string) => Date.UTC(int(iso.slice(0, 4)), int(iso.slice(5, 7)) - 1, int(iso.slice(8, 10)));

/** `iso` plus `months`, keeping the day of month and clamping to short months. */
export function addMonthsIso(iso: string, months: number): string {
  const y = int(iso.slice(0, 4));
  const m = int(iso.slice(5, 7)) - 1 + months;
  const d = int(iso.slice(8, 10));
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`;
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(utc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((utc(iso10(to)) - utc(iso10(from))) / DAY_MS);
}

/** Yearly premium outgo. A single premium is a one-off, not a yearly cost. */
export function premiumToAnnual(amount: Decimal, frequency: string): Decimal {
  switch (frequency) {
    case 'MONTHLY':
      return amount.times(12);
    case 'QUARTERLY':
      return amount.times(4);
    case 'HALF_YEARLY':
      return amount.times(2);
    case 'SINGLE':
      return new Decimal(0);
    default:
      return amount;
  }
}

/** Days allowed to pay a missed premium before the policy lapses (see GRACE_PERIOD_BASIS). */
export function defaultGraceDays(type: string, frequency: string): number {
  if (frequency === 'SINGLE' || !LIFE_OR_HEALTH.has(type)) return 0;
  return frequency === 'MONTHLY' ? 15 : 30;
}

export interface PremiumScheduleInput {
  startDate: string;
  premiumFrequency: string;
  maturityDate?: string | null;
}

export interface PremiumPaymentLike {
  periodFrom: string;
  periodTo?: string;
  paidOn: string;
  amount: string;
}

/**
 * PAID — a payment is recorded for it. UNTRACKED — due before the policy was
 * tracked here, with no payment recorded (not treated as missed). OVERDUE —
 * due and unpaid. UPCOMING — not yet due.
 */
export type PremiumRowStatus = 'PAID' | 'UNTRACKED' | 'OVERDUE' | 'UPCOMING';

export interface PremiumScheduleRow<P extends PremiumPaymentLike = PremiumPaymentLike> {
  index: number;
  dueDate: string;
  periodFrom: string;
  periodTo: string;
  payment: P | null;
  status: PremiumRowStatus;
}

export interface PremiumScheduleOptions {
  today: string;
  /** Unpaid premiums due before this date are UNTRACKED rather than OVERDUE. */
  untrackedBefore?: string | null;
  /** How many future premiums to list (default 3). */
  futurePeriods?: number;
}

const MAX_ROWS = 600;

export function buildPremiumSchedule<P extends PremiumPaymentLike>(
  policy: PremiumScheduleInput,
  payments: readonly P[],
  opts: PremiumScheduleOptions,
): PremiumScheduleRow<P>[] {
  const today = iso10(opts.today);
  const sorted = [...payments].sort((a, b) => iso10(a.periodFrom).localeCompare(iso10(b.periodFrom)));
  const months = PREMIUM_FREQUENCY_MONTHS[policy.premiumFrequency];

  // A single premium has no schedule — just what was paid.
  if (!months) {
    return sorted.map((p, i) => ({
      index: i + 1,
      dueDate: iso10(p.periodFrom),
      periodFrom: iso10(p.periodFrom),
      periodTo: iso10(p.periodTo ?? policy.maturityDate ?? p.periodFrom),
      payment: p,
      status: 'PAID' as const,
    }));
  }

  const start = iso10(policy.startDate);
  const maturity = policy.maturityDate ? iso10(policy.maturityDate) : null;
  const untrackedBefore = opts.untrackedBefore ? iso10(opts.untrackedBefore) : null;
  const futurePeriods = opts.futurePeriods ?? 3;
  const used = new Set<P>();
  const rows: PremiumScheduleRow<P>[] = [];

  let future = 0;
  for (let i = 0; i < MAX_ROWS; i++) {
    const dueDate = addMonthsIso(start, i * months);
    // No premium falls due on or after maturity.
    if (maturity && dueDate >= maturity) break;
    if (dueDate > today && ++future > futurePeriods) break;

    const payment =
      sorted.find((p) => !used.has(p) && iso10(p.periodFrom).slice(0, 7) === dueDate.slice(0, 7)) ?? null;
    if (payment) used.add(payment);

    const status: PremiumRowStatus = payment
      ? 'PAID'
      : untrackedBefore && dueDate < untrackedBefore
        ? 'UNTRACKED'
        : dueDate < today
          ? 'OVERDUE'
          : 'UPCOMING';

    rows.push({
      index: i + 1,
      dueDate,
      periodFrom: dueDate,
      periodTo: addMonthsIso(start, (i + 1) * months),
      payment,
      status,
    });
  }
  return rows;
}

/**
 * PAID_UP — nothing left to pay. UPCOMING / DUE_SOON — next premium ahead
 * (DUE_SOON within DUE_SOON_DAYS). IN_GRACE — past due, still inside the grace
 * period. LAPSE_RISK — past due and past grace; the policy may have lapsed.
 */
export type PremiumDueState = 'PAID_UP' | 'UPCOMING' | 'DUE_SOON' | 'IN_GRACE' | 'LAPSE_RISK';

export interface NextPremiumDue {
  dueDate: string | null;
  state: PremiumDueState;
  /** Negative once past due. */
  daysUntilDue: number | null;
  graceEndsOn: string | null;
  daysLeftInGrace: number | null;
}

/** The earliest unpaid premium in `rows`, and where the policy stands on it. */
export function nextPremiumDue(
  rows: readonly PremiumScheduleRow[],
  opts: { today: string; graceDays: number },
): NextPremiumDue {
  const next = rows.find((r) => r.status === 'OVERDUE' || r.status === 'UPCOMING');
  return premiumDueOn(next?.dueDate ?? null, opts);
}

/**
 * Where a policy stands on a premium due on `dueDate` (null = nothing due).
 * For callers that already know the next due date, e.g. from the stored
 * `nextPremiumDue`, without rebuilding the schedule.
 */
export function premiumDueOn(
  dueDate: string | null,
  opts: { today: string; graceDays: number },
): NextPremiumDue {
  if (!dueDate) {
    return { dueDate: null, state: 'PAID_UP', daysUntilDue: null, graceEndsOn: null, daysLeftInGrace: null };
  }
  const due = iso10(dueDate);
  const today = iso10(opts.today);
  const graceEndsOn = opts.graceDays > 0 ? addDaysIso(due, opts.graceDays) : null;
  const daysUntilDue = daysBetweenIso(today, due);

  if (daysUntilDue >= 0) {
    return {
      dueDate: due,
      state: daysUntilDue <= DUE_SOON_DAYS ? 'DUE_SOON' : 'UPCOMING',
      daysUntilDue,
      graceEndsOn,
      daysLeftInGrace: null,
    };
  }
  if (graceEndsOn) {
    const left = daysBetweenIso(today, graceEndsOn);
    if (left >= 0) {
      return { dueDate: due, state: 'IN_GRACE', daysUntilDue, graceEndsOn, daysLeftInGrace: left };
    }
  }
  return { dueDate: due, state: 'LAPSE_RISK', daysUntilDue, graceEndsOn, daysLeftInGrace: null };
}
