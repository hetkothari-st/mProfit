import { Decimal, goalRateDivision } from '@everypaisa/shared';
import type { PersonalInflationSummary } from '@everypaisa/shared';

/** "0.150000" → "15.0%". Null-safe. */
export function formatRatePct(rate: string | null | undefined, digits = 1): string {
  if (rate == null) return '—';
  return `${new Decimal(rate).times(100).toFixed(digits)}%`;
}

/** "2026-09" → "Sep 2026". */
export function formatCpiMonth(ym: string | null): string | null {
  if (!ym) return null;
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export interface RateSuggestion {
  /** Fraction string, 4 dp — what the Goal form stores. */
  rate: string;
  label: string;
}

/**
 * What the Goal dialog offers for a goal category. Education goals use the
 * user's own education rate (their school-fee items) or the official education
 * rate; vehicle goals use transport, healthcare goals health; everything else the personal basket rate,
 * then official headline CPI.
 */
export function suggestGoalRate(summary: PersonalInflationSummary | undefined, category: string): RateSuggestion | null {
  if (!summary) return null;
  const division = goalRateDivision(category);
  const pick = (rate: string | null | undefined, label: string): RateSuggestion | null =>
    rate == null ? null : { rate: new Decimal(rate).toFixed(4), label };

  if (division) {
    const mine = summary.byDivision.find((d) => d.divisionCode === division)?.rate;
    const what = division === '10' ? 'education' : division === '06' ? 'health' : 'transport';
    const official = summary.official.find((o) => o.divisionCode === division)?.longRunRate;
    return pick(mine, `your ${what} inflation`) ?? pick(official, `official ${what} inflation`);
  }
  const headline = summary.official.find((o) => o.divisionCode === '00')?.longRunRate;
  return pick(summary.personalRate, 'your personal inflation') ?? pick(headline, 'official CPI inflation');
}

export interface DriverRow {
  /** CPI division code, or null for the folded "other small categories" row. */
  code: string | null;
  share: Decimal;
  rate: Decimal;
  /** Categories folded into this row (1 for a normal row). */
  count: number;
}

/** Categories below this share of basket spend are folded into one row. */
export const SMALL_CATEGORY_FOLD = new Decimal('0.02');

/**
 * The "what's driving it" rows: rated categories ordered by how much they push
 * the personal rate (share × rate). Categories under 2% of spend are folded
 * into one row at their spend-weighted rate, so the list stays readable;
 * a lone small category is shown as itself.
 */
export function driverRows(byDivision: PersonalInflationSummary['byDivision']): DriverRow[] {
  const rows = byDivision
    .filter((d) => d.rate != null)
    .map((d) => ({ code: d.divisionCode as string | null, share: new Decimal(d.share), rate: new Decimal(d.rate!), count: 1 }));
  const small = rows.filter((r) => r.share.lessThan(SMALL_CATEGORY_FOLD));
  const out = small.length > 1 ? rows.filter((r) => !small.includes(r)) : rows;
  if (small.length > 1) {
    const share = small.reduce((s, r) => s.plus(r.share), new Decimal(0));
    const weighted = small.reduce((s, r) => s.plus(r.share.times(r.rate)), new Decimal(0));
    out.push({ code: null, share, rate: share.isZero() ? new Decimal(0) : weighted.dividedBy(share), count: small.length });
  }
  return out.sort((a, b) => b.share.times(b.rate).comparedTo(a.share.times(a.rate)));
}
