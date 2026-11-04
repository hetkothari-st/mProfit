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
 * rate; vehicle goals use transport; everything else the personal basket rate,
 * then official headline CPI.
 */
export function suggestGoalRate(summary: PersonalInflationSummary | undefined, category: string): RateSuggestion | null {
  if (!summary) return null;
  const division = goalRateDivision(category);
  const pick = (rate: string | null | undefined, label: string): RateSuggestion | null =>
    rate == null ? null : { rate: new Decimal(rate).toFixed(4), label };

  if (division) {
    const mine = summary.byDivision.find((d) => d.divisionCode === division)?.rate;
    const what = division === '10' ? 'education' : 'transport';
    const official = summary.official.find((o) => o.divisionCode === division)?.longRunRate;
    return pick(mine, `your ${what} inflation`) ?? pick(official, `official ${what} inflation`);
  }
  const headline = summary.official.find((o) => o.divisionCode === '00')?.longRunRate;
  return pick(summary.personalRate, 'your personal inflation') ?? pick(headline, 'official CPI inflation');
}
