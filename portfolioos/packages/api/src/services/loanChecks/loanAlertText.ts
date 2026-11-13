/**
 * Alert wording for the existing-loan checks (spec s6.3). Dates dd/mm/yyyy, rates to 2 dp, money rounded;
 * plain hyphens only. Pure, so the exact text is pinned by unit tests.
 */
import { approxInr, formatDateOnly, formatINR, type BenchmarkKind, type Decimal, type PassThroughEstimate } from '@everypaisa/shared';

const LOAN_LABELS: ReadonlyMap<string, string> = new Map([
  ['HOME', 'Home loan'],
  ['CAR', 'Car loan'],
  ['PERSONAL', 'Personal loan'],
  ['EDUCATION', 'Education loan'],
  ['BUSINESS', 'Business loan'],
  ['GOLD', 'Gold loan'],
  ['LAS', 'Loan against securities'],
]);

export function loanLabel(loanType: string): string {
  return LOAN_LABELS.get(loanType) ?? 'Loan';
}

export interface AlertText {
  title: string;
  description: string;
}

const pct = (d: Decimal) => d.toFixed(2);
const rupees = (d: Decimal) => formatINR(d.toFixed(0), { fractionDigits: 0 });

export function refinanceAlertText(i: {
  loanType: string;
  lenderName: string;
  currentRatePct: Decimal;
  marketLender: string;
  marketRatePct: Decimal;
  netSaving: Decimal;
}): AlertText {
  return {
    title: `${loanLabel(i.loanType)} with ${i.lenderName} at ${pct(i.currentRatePct)}%; market from ${pct(i.marketRatePct)}%`,
    description: `Switching could save ≈ ${approxInr(i.netSaving)} after switching costs (lowest: ${i.marketLender}). Open the loan to compare.`,
  };
}

export function benchmarkAlertText(i: {
  kind: BenchmarkKind;
  /** Canonical lender of an MCLR series; null for REPO. */
  benchmarkLender: string | null;
  deltaPct: Decimal;
  effectiveDate: string;
  /** The loan's lender as the user typed it. */
  lenderName: string;
  nextResetDate: string | null;
  estimate: PassThroughEstimate | null;
}): AlertText {
  const cut = i.deltaPct.isNegative();
  const verb = cut ? 'cut' : 'raised';
  const size = `${i.deltaPct.abs().toFixed(2)}%`;
  const on = formatDateOnly(i.effectiveDate);
  const title =
    i.kind === 'REPO'
      ? `RBI ${verb} the repo rate by ${size} on ${on}`
      : `${i.benchmarkLender ?? 'Your lender'} ${verb} its 1-year MCLR by ${size} on ${on}`;
  const reset = i.nextResetDate !== null ? ` (≈ ${formatDateOnly(i.nextResetDate)})` : '';
  let description = `Your ${i.lenderName} loan rate should ${cut ? 'drop' : 'rise'} at the next reset${reset}.`;
  if (i.estimate !== null) {
    const months = i.estimate.tenureDeltaMonths;
    const tenure =
      months === null || months === 0
        ? ''
        : ` or tenure ${months > 0 ? '+' : '-'}${Math.abs(months)} month${Math.abs(months) === 1 ? '' : 's'}`;
    description += ` Estimated: EMI ≈ ${rupees(i.estimate.newEmi)}${tenure}, assuming the full change is passed on.`;
  }
  return { title, description };
}
