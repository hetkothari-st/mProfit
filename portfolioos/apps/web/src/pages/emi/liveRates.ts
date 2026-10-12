import { Decimal, formatDateOnly, type LoanRateRowWire, type RateLoanType, type RepoRateWire, type TaxLoanKind } from '@everypaisa/shared';

/** Tax defaults that follow from the chosen loan type (plan ruling 14). */
export function loanKindForRate(loanType: RateLoanType, current: TaxLoanKind): TaxLoanKind {
  if (loanType === 'HOME') return current === 'HOME_LET_OUT' ? 'HOME_LET_OUT' : 'HOME_SELF';
  if (loanType === 'EDUCATION') return 'EDUCATION';
  return 'NONE';
}

/** The row to highlight: lowest minimum rate among rows that are not stale. */
export function bestRowId(rows: LoanRateRowWire[]): string | null {
  let best: LoanRateRowWire | null = null;
  for (const row of rows) {
    if (row.stale) continue;
    if (best === null || new Decimal(row.minRatePct).lessThan(best.minRatePct)) best = row;
  }
  return best?.sourceId ?? null;
}

export function rateRange(row: Pick<LoanRateRowWire, 'minRatePct' | 'maxRatePct'>): string {
  return row.maxRatePct === null ? `from ${row.minRatePct}%` : `${row.minRatePct}% - ${row.maxRatePct}%`;
}

/** The repo header. A zero delta is not a change, so it reads like no change at all. */
export function repoLine(repo: RepoRateWire): string {
  const base = `RBI repo rate ${repo.ratePct}%`;
  const delta = repo.lastChange === null ? null : new Decimal(repo.lastChange.deltaPct);
  if (repo.lastChange === null || delta === null || delta.isZero()) return `${base} (as of ${formatDateOnly(repo.effectiveDate)})`;
  return `${base} - ${delta.isNegative() ? 'cut' : 'raised'} by ${delta.abs().toFixed(2)}% on ${formatDateOnly(repo.lastChange.date)}`;
}
