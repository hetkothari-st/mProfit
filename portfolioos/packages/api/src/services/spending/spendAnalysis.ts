import { Decimal } from 'decimal.js';
import { DEFAULT_CATEGORY_CPI_DIVISION, isBasketCategory, type BasketCategory } from '@everypaisa/shared';

/**
 * Pure analysis over a user's categorised spending (spec §5–§8). No DB.
 *
 * - Recurring series: the same payee paid on a regular cadence (rent, fees,
 *   subscriptions, maintenance, premiums). Fixed series are what the own-price
 *   inflation method (step 6) compares year on year.
 * - One-offs: a big, non-recurring purchase (> 3× the category's typical
 *   month) is set aside so a new sofa does not reweight the basket.
 * - Refunds: matched to the payment they reverse and netted off its category.
 * - Monthly totals per category: the derived store the rate engine reads.
 * - Manual expenses: matched to a recurring bank payment so the same rent is
 *   not counted twice (decision 1; the item itself is never changed).
 */

const DAY_MS = 86_400_000;

export type Cadence = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export const SPEND_ANALYSIS = {
  /** Neighbouring payments within ±10% count as the same price. */
  amountTolerance: new Decimal('0.10'),
  /** Fewest payments to call a series, by cadence (an annual fee needs two years). */
  minOccurrences: { MONTHLY: 3, QUARTERLY: 3, ANNUAL: 2 } as Record<Cadence, number>,
  /** Share of gaps that must fit the cadence. */
  regularShare: 0.75,
  /** Share of neighbouring payments within tolerance for a series to be "fixed". */
  fixedShare: 0.8,
  oneOffMultiple: new Decimal(3),
  /** A refund is looked for against payments up to this many days earlier. */
  refundWindowDays: 60,
} as const;

/** Gap windows in days (the spec's ±5 days around the cadence). */
const CADENCE_GAPS: Record<Cadence, [number, number]> = {
  MONTHLY: [24, 37],
  QUARTERLY: [84, 100],
  ANNUAL: [355, 375],
};

export interface AnalysisRow {
  id: string;
  txnDate: Date;
  amount: Decimal;
  direction: string;
  category: string | null;
  /** Null when the payee could not be keyed. */
  payeeKey: string | null;
  /** True for rows that are not spending at all (duplicates, self transfers). */
  ignored: boolean;
}

export interface DetectedSeries {
  payeeKey: string;
  category: string;
  cadence: Cadence;
  firstSeen: Date;
  lastSeen: Date;
  occurrences: number;
  /** The latest payment's amount: the price now. */
  latestAmount: Decimal;
  isFixed: boolean;
  memberIds: string[];
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

function decMedian(xs: readonly Decimal[]): Decimal {
  const s = [...xs].sort((a, b) => a.comparedTo(b));
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : s[m - 1]!.plus(s[m]!).dividedBy(2);
}

const within = (a: Decimal, b: Decimal, tol: Decimal) => a.minus(b).abs().lessThanOrEqualTo(b.times(tol));

/** Most common category among the rows (ties: the latest row's). */
function majorityCategory(rows: readonly AnalysisRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.category ?? 'uncategorised', (counts.get(r.category ?? 'uncategorised') ?? 0) + 1);
  const best = Math.max(...counts.values());
  for (let i = rows.length - 1; i >= 0; i--) {
    const c = rows[i]!.category ?? 'uncategorised';
    if (counts.get(c) === best) return c;
  }
  return 'uncategorised';
}

/** Spending debits only: a series, one-off or total never includes transfers or income. */
const isSpendDebit = (r: AnalysisRow) => !r.ignored && r.direction === 'DEBIT';

export function detectSeries(rows: readonly AnalysisRow[]): DetectedSeries[] {
  const byPayee = new Map<string, AnalysisRow[]>();
  for (const r of rows) {
    if (!isSpendDebit(r) || !r.payeeKey || !r.category || !isBasketCategory(r.category)) continue;
    const g = byPayee.get(r.payeeKey);
    if (g) g.push(r);
    else byPayee.set(r.payeeKey, [r]);
  }

  const out: DetectedSeries[] = [];
  for (const [payeeKey, list] of byPayee) {
    // A payment far above the payee's usual amount (a stock-up at the usual
    // grocer) is not part of the series; it is judged as a possible one-off.
    const usual = decMedian(list.map((r) => r.amount));
    const sorted = list
      .filter((r) => !r.amount.greaterThan(usual.times(SPEND_ANALYSIS.oneOffMultiple)))
      .sort((a, b) => a.txnDate.getTime() - b.txnDate.getTime());
    if (sorted.length < 2) continue;
    const gaps = sorted.slice(1).map((r, i) => (r.txnDate.getTime() - sorted[i]!.txnDate.getTime()) / DAY_MS);
    const typical = median(gaps);
    const cadence = (Object.keys(CADENCE_GAPS) as Cadence[]).find((c) => typical >= CADENCE_GAPS[c][0] && typical <= CADENCE_GAPS[c][1]);
    if (!cadence) continue;
    if (sorted.length < SPEND_ANALYSIS.minOccurrences[cadence]) continue;
    const [lo, hi] = CADENCE_GAPS[cadence];
    const regular = gaps.filter((g) => g >= lo && g <= hi).length / gaps.length;
    if (regular < SPEND_ANALYSIS.regularShare) continue;

    const steady = sorted.slice(1).filter((r, i) => within(r.amount, sorted[i]!.amount, SPEND_ANALYSIS.amountTolerance)).length;
    out.push({
      payeeKey,
      category: majorityCategory(sorted),
      cadence,
      firstSeen: sorted[0]!.txnDate,
      lastSeen: sorted[sorted.length - 1]!.txnDate,
      occurrences: sorted.length,
      latestAmount: sorted[sorted.length - 1]!.amount,
      isFixed: steady / (sorted.length - 1) >= SPEND_ANALYSIS.fixedShare,
      memberIds: sorted.map((r) => r.id),
    });
  }
  return out;
}

export const monthOf = (d: Date) => d.toISOString().slice(0, 7);

/**
 * One-offs: a basket debit, not part of a series, larger than 3× the median
 * monthly total of its category (spec §8). A category needs three months of
 * history before anything in it is called a one-off.
 */
export function findOneOffs(rows: readonly AnalysisRow[], seriesMemberIds: ReadonlySet<string>): Set<string> {
  const monthly = new Map<string, Map<string, Decimal>>();
  for (const r of rows) {
    if (!isSpendDebit(r) || !r.category || !isBasketCategory(r.category)) continue;
    const m = monthly.get(r.category) ?? new Map<string, Decimal>();
    m.set(monthOf(r.txnDate), (m.get(monthOf(r.txnDate)) ?? new Decimal(0)).plus(r.amount));
    monthly.set(r.category, m);
  }
  const out = new Set<string>();
  for (const r of rows) {
    if (!isSpendDebit(r) || !r.category || !isBasketCategory(r.category) || seriesMemberIds.has(r.id)) continue;
    const months = monthly.get(r.category)!;
    if (months.size < 3) continue;
    if (r.amount.greaterThan(decMedian([...months.values()]).times(SPEND_ANALYSIS.oneOffMultiple))) out.add(r.id);
  }
  return out;
}

/**
 * Refunds: each refund credit is matched to the latest earlier payment to the
 * same payee, within 60 days, that is at least as large. The refund is then
 * netted off that payment's category in the refund's own month.
 */
export function matchRefunds(rows: readonly AnalysisRow[]): Map<string, string> {
  const debitsByPayee = new Map<string, AnalysisRow[]>();
  for (const r of rows) {
    if (!isSpendDebit(r) || !r.payeeKey) continue;
    const g = debitsByPayee.get(r.payeeKey);
    if (g) g.push(r);
    else debitsByPayee.set(r.payeeKey, [r]);
  }
  const out = new Map<string, string>();
  const used = new Set<string>();
  const refunds = rows
    .filter((r) => !r.ignored && r.direction === 'CREDIT' && r.category === 'refund' && r.payeeKey)
    .sort((a, b) => a.txnDate.getTime() - b.txnDate.getTime());
  for (const ref of refunds) {
    const candidates = (debitsByPayee.get(ref.payeeKey!) ?? [])
      .filter((d) => !used.has(d.id))
      .filter((d) => d.txnDate.getTime() <= ref.txnDate.getTime())
      .filter((d) => ref.txnDate.getTime() - d.txnDate.getTime() <= SPEND_ANALYSIS.refundWindowDays * DAY_MS)
      .filter((d) => d.amount.greaterThanOrEqualTo(ref.amount))
      .sort((a, b) => b.txnDate.getTime() - a.txnDate.getTime());
    const hit = candidates[0];
    if (hit) {
      out.set(ref.id, hit.id);
      used.add(hit.id);
    }
  }
  return out;
}

export interface MonthlyCategoryTotal {
  month: string;
  category: string;
  /** Spending counted in the basket: payments minus matched refunds, one-offs left out. */
  amount: Decimal;
  oneOffAmount: Decimal;
  count: number;
}

/**
 * Monthly spend per category: every spending category, the excluded ones and
 * "uncategorised" included, so the engine can work out how much of the
 * user's spending is sorted. Refunds net against the category they reverse.
 */
export function monthlyTotals(
  rows: readonly AnalysisRow[],
  oneOffIds: ReadonlySet<string>,
  refundOf: ReadonlyMap<string, string>,
): MonthlyCategoryTotal[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const totals = new Map<string, MonthlyCategoryTotal>();
  const bucket = (month: string, category: string) => {
    const key = `${month}|${category}`;
    let t = totals.get(key);
    if (!t) {
      t = { month, category, amount: new Decimal(0), oneOffAmount: new Decimal(0), count: 0 };
      totals.set(key, t);
    }
    return t;
  };
  for (const r of rows) {
    if (!isSpendDebit(r)) continue;
    const t = bucket(monthOf(r.txnDate), r.category ?? 'uncategorised');
    if (oneOffIds.has(r.id)) t.oneOffAmount = t.oneOffAmount.plus(r.amount);
    else {
      t.amount = t.amount.plus(r.amount);
      t.count += 1;
    }
  }
  for (const [refundId, debitId] of refundOf) {
    const refund = byId.get(refundId)!;
    const debit = byId.get(debitId)!;
    if (oneOffIds.has(debitId)) continue; // the purchase was never counted
    const t = bucket(monthOf(refund.txnDate), debit.category ?? 'uncategorised');
    t.amount = Decimal.max(0, t.amount.minus(refund.amount));
  }
  return [...totals.values()].sort((a, b) => a.month.localeCompare(b.month) || a.category.localeCompare(b.category));
}

export interface ManualItem {
  id: string;
  divisionCode: string;
  amount: Decimal;
  frequency: 'MONTHLY' | 'YEARLY';
}

export interface SeriesForMatch {
  key: string;
  category: string;
  cadence: Cadence;
  latestAmount: Decimal;
}

const PER_YEAR: Record<Cadence, number> = { MONTHLY: 12, QUARTERLY: 4, ANNUAL: 1 };

/**
 * Decision 1: a manual expense is "already in your bank data" when a
 * recurring bank series in the same CPI division costs the same per year
 * (±10%). Each series matches at most one item, the closest in amount.
 * Returns item id → series key.
 */
export function matchManualItems(items: readonly ManualItem[], series: readonly SeriesForMatch[]): Map<string, string> {
  const yearly = (s: SeriesForMatch) => s.latestAmount.times(PER_YEAR[s.cadence]);
  const itemYearly = (i: ManualItem) => (i.frequency === 'MONTHLY' ? i.amount.times(12) : i.amount);
  const division = (category: string) => (isBasketCategory(category) ? DEFAULT_CATEGORY_CPI_DIVISION[category as BasketCategory] : null);

  const pairs: { item: string; series: string; diff: Decimal }[] = [];
  for (const i of items) {
    for (const s of series) {
      if (division(s.category) !== i.divisionCode) continue;
      const a = itemYearly(i);
      const b = yearly(s);
      if (b.isZero() || !within(a, b, SPEND_ANALYSIS.amountTolerance)) continue;
      pairs.push({ item: i.id, series: s.key, diff: a.minus(b).abs() });
    }
  }
  pairs.sort((x, y) => x.diff.comparedTo(y.diff));
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.item) || taken.has(p.series)) continue;
    out.set(p.item, p.series);
    taken.add(p.series);
  }
  return out;
}
