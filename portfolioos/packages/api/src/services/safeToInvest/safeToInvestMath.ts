import { Decimal } from 'decimal.js';

/**
 * Pure Safe-to-Invest maths. No DB, no clock: callers pass `now`.
 * Money is Decimal throughout; months are 'YYYY-MM' strings in IST.
 */

const ZERO = new Decimal(0);

/** Months of bank income needed before the bank figure replaces declared income. */
export const MIN_BANK_MONTHS = 6;
/** Months of spending data needed before the buffer is worked out from debits. */
export const MIN_DEBIT_MONTHS = 3;
/** Lean month = this percentile of monthly income: a bad but normal month. */
export const LEAN_PERCENTILE = 20;
/** Buffer = this percentile of monthly everyday spend: a heavy but normal month. */
export const BUFFER_PERCENTILE = 75;
/** Buffer when there is too little spending data: this share of the lean month. */
export const ESTIMATED_BUFFER_SHARE = new Decimal('0.30');
/** SIP amounts are rounded down to this step. */
export const SIP_STEP = 500;
/** Top-ups are rounded down to this step. */
export const TOP_UP_STEP = 100;

/**
 * Safety trim on declared income when there is too little bank history: a
 * salary is fairly predictable, other income less so.
 */
export const DECLARED_HAIRCUT: Readonly<Record<string, Decimal>> = {
  SALARY: new Decimal('0.90'),
  RENTAL: new Decimal('0.85'),
};
const DEFAULT_HAIRCUT = new Decimal('0.80');
/** Declared income types that are not a regular monthly inflow. */
const IRREGULAR_INCOME_TYPES = new Set(['CAPITAL_GAINS']);

/**
 * Percentile with linear interpolation between closest ranks (the common
 * "type 7" definition, as in Excel's PERCENTILE.INC). Null for no values.
 */
export function percentile(values: readonly Decimal[], p: number): Decimal | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  if (sorted.length === 1) return sorted[0]!;
  // Rank in Decimal: 0.2 × 11 in floating point is 2.2000000000000002.
  const rank = new Decimal(p).dividedBy(100).times(sorted.length - 1);
  const lo = rank.floor().toNumber();
  const hi = rank.ceil().toNumber();
  const frac = rank.minus(lo);
  return sorted[lo]!.plus(sorted[hi]!.minus(sorted[lo]!).times(frac));
}

/**
 * How steady income is, 0–100: the lean month as a share of a typical
 * (median) month. 58 means a bad month brings in 58% of a normal one.
 */
export function stabilityScore(lean: Decimal, typical: Decimal): number | null {
  if (typical.lessThanOrEqualTo(0)) return null;
  const ratio = Decimal.max(ZERO, lean).dividedBy(typical).times(100);
  return Math.min(100, Math.round(ratio.toNumber()));
}

export function stabilityLabel(score: number | null): 'STABLE' | 'SOMEWHAT_VARIABLE' | 'VARIABLE' | null {
  if (score === null) return null;
  if (score >= 85) return 'STABLE';
  if (score >= 60) return 'SOMEWHAT_VARIABLE';
  return 'VARIABLE';
}

export function floorToStep(amount: Decimal, step: number): Decimal {
  if (amount.lessThanOrEqualTo(0)) return ZERO;
  return amount.dividedBy(step).floor().times(step);
}

/** Lean income − fixed costs − buffer, never below zero, rounded down to ₹500. */
export function safeAmount(lean: Decimal, fixed: Decimal, buffer: Decimal): Decimal {
  return floorToStep(lean.minus(fixed).minus(buffer), SIP_STEP);
}

/** The good-month top-up: a share of whatever the month earned above the lean month. */
export function topUp(inflow: Decimal, lean: Decimal, share: Decimal): { surplus: Decimal; topUp: Decimal } {
  const surplus = Decimal.max(ZERO, inflow.minus(lean));
  return { surplus, topUp: floorToStep(surplus.times(share), TOP_UP_STEP) };
}

/** Declared monthly income, trimmed for safety by type. Irregular income is left out. */
export function declaredLeanIncome(incomes: readonly { type: string; monthly: Decimal }[]): Decimal {
  return incomes
    .filter((i) => !IRREGULAR_INCOME_TYPES.has(i.type) && i.monthly.greaterThan(0))
    .reduce((s, i) => s.plus(i.monthly.times(DECLARED_HAIRCUT[i.type] ?? DEFAULT_HAIRCUT)), ZERO);
}

/** A SIP's amount as a monthly figure. */
export function monthlySip(amount: Decimal, frequency: string): Decimal {
  if (frequency === 'QUARTERLY') return amount.dividedBy(3);
  if (frequency === 'ANNUAL') return amount.dividedBy(12);
  return amount;
}

// ── Months ──────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 330 * 60_000;

/** The IST calendar month a moment falls in. */
export function istMonth(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);
}

/** A @db.Date value's month: stored as UTC midnight of the calendar day. */
export function dateMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map((x) => Number.parseInt(x, 10));
  const total = y! * 12 + (m! - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** The twelve complete months before the current one, oldest first. */
export function lastTwelveMonths(now: Date): string[] {
  const current = istMonth(now);
  return Array.from({ length: 12 }, (_, i) => shiftMonth(current, i - 12));
}

/** First day of a month as a UTC-midnight Date, for @db.Date comparisons. */
export function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00Z`);
}

/**
 * Months, among those with SIP activity, that had none: counted from the
 * first month with a SIP, so a SIP started recently is not "missed" before it.
 */
export function missedSipMonths(months: readonly string[], withSip: ReadonlySet<string>): number {
  const first = months.findIndex((m) => withSip.has(m));
  if (first === -1) return 0;
  return months.slice(first).filter((m) => !withSip.has(m)).length;
}
