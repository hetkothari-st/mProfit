/**
 * Personal accident cover check. Pure; money is Decimal end to end.
 *
 * Accident cover has two jobs. The lump sums (accidental death, permanent
 * total disability) replace lost income and clear debts if you can no longer
 * earn; the recovery benefits (weekly temporary-disability pay) bridge the
 * months you cannot work but will return. We size the first against the
 * user's own income and loans, and the second against their monthly expenses.
 *
 * A deliberately simple, transparent rule of thumb. It ignores inflation, tax,
 * care costs and your family's other needs, and says so. Every figure about
 * the user's situation comes from the user.
 */

import { Decimal, formatINR, serializeMoney } from '@everypaisa/shared';
import type { Money, PaCoverInput, PaCoverOutput } from '@everypaisa/shared';
import type { PaExtraction } from './paExtractionSchema.js';

export const DEFAULT_YEARS_TO_REPLACE = 10;
export const MIN_YEARS = 5;
export const MAX_YEARS = 30;

type F<T> = { value: T | null; status: string } | undefined;
const val = <T>(f: F<T>): T | null => (f && f.status !== 'NOT_FOUND' && f.value !== null && f.value !== undefined ? f.value : null);

function dec(v: string | null | undefined): Decimal | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    const x = new Decimal(v);
    return x.isFinite() && x.gte(0) ? x : null;
  } catch {
    return null;
  }
}

const fmt = (d: Decimal): Money => serializeMoney(d.toDecimalPlaces(0));
const inr = (d: Decimal): string => formatINR(fmt(d), { fractionDigits: 0 });

export function calculatePaCover(input: PaCoverInput, x: PaExtraction): PaCoverOutput {
  const missing: string[] = [];
  const assumptions: string[] = [];

  const income = dec(input.annualIncomeInr);
  const loans = dec(input.outstandingLoansInr);
  const other = dec(input.otherAccidentCoverInr);
  const expenses = dec(input.monthlyExpensesInr);
  const death = dec(val<string>(x.accidentalDeathInr));
  const ptd = dec(val<string>(x.permanentTotalDisabilityInr));
  const weekly = dec(val<string>(x.temporaryDisabilityWeeklyInr));
  const weeks = val<number>(x.temporaryDisabilityMaxWeeks);

  let years = input.yearsOfIncomeToReplace ?? DEFAULT_YEARS_TO_REPLACE;
  if (!Number.isFinite(years) || years < MIN_YEARS || years > MAX_YEARS) {
    assumptions.push(`Years of income to replace must be between ${MIN_YEARS} and ${MAX_YEARS}; using ${DEFAULT_YEARS_TO_REPLACE}.`);
    years = DEFAULT_YEARS_TO_REPLACE;
  }

  const out: PaCoverOutput = {
    incomeReplacementInr: null,
    totalNeedInr: null,
    deathCoverInr: null,
    deathShortfallInr: null,
    disabilityCoverInr: null,
    disabilityShortfallInr: null,
    recoveryMonthlyBenefitInr: null,
    recoveryExpensesCoveredPct: null,
    recoveryMaxWeeks: weeks,
    summary: '',
    assumptions,
    missingInputs: missing,
  };

  const lines: string[] = [];

  if (income && !income.isZero()) {
    const replacement = income.mul(years);
    const need = replacement.plus(loans ?? 0);
    out.incomeReplacementInr = fmt(replacement);
    out.totalNeedInr = fmt(need);
    if (loans === null) missing.push('outstanding loans (counted as ₹0)');
    if (other === null) missing.push('accident cover under other policies (counted as ₹0)');

    if (death) {
      const cover = death.plus(other ?? 0);
      const gap = Decimal.max(need.minus(cover), new Decimal(0));
      out.deathCoverInr = fmt(cover);
      out.deathShortfallInr = fmt(gap);
      lines.push(
        gap.isZero()
          ? 'Your accidental-death cover meets the estimated need.'
          : `Your accidental-death cover is about ${inr(gap)} short of the estimated need (${inr(need)}).`,
      );
    } else {
      missing.push('accidental death sum insured (not found in the documents)');
    }

    if (ptd) {
      const cover = ptd.plus(other ?? 0);
      const gap = Decimal.max(need.minus(cover), new Decimal(0));
      out.disabilityCoverInr = fmt(cover);
      out.disabilityShortfallInr = fmt(gap);
      lines.push(
        gap.isZero()
          ? 'Your permanent-disability cover meets the estimated need.'
          : `Your permanent-total-disability cover is about ${inr(gap)} short of the estimated need.`,
      );
    } else {
      missing.push('permanent total disability sum insured (not found in the documents)');
    }
  } else {
    missing.push('annual income');
  }

  if (weekly && !weekly.isZero()) {
    const monthly = weekly.mul(52).div(12);
    out.recoveryMonthlyBenefitInr = fmt(monthly);
    if (expenses && !expenses.isZero()) {
      const share = monthly.div(expenses).mul(100);
      out.recoveryExpensesCoveredPct = share.toDecimalPlaces(2).toFixed(2);
      lines.push(
        `While you recover, the weekly benefit pays about ${inr(monthly)} a month, ${share.toDecimalPlaces(0).toFixed(0)}% of your monthly expenses` +
          (weeks ? `, for up to ${weeks} weeks.` : '.'),
      );
    } else {
      missing.push('monthly expenses (to compare with the recovery benefit)');
    }
  }

  out.summary =
    lines.length > 0
      ? lines.join(' ')
      : 'Enter your annual income to compare the accident cover with what your family would need, and your monthly expenses to compare it with the recovery benefit.';

  assumptions.push(
    `Need = annual income × ${years} years + outstanding loans. The lump sum is meant to replace the income you could no longer earn and clear what you owe.`,
    'Permanent total disability is judged against the same need as death, because the income stops either way.',
    'Ignores inflation, tax, the cost of care and your family’s other needs.',
    'A rule of thumb to start a conversation, not financial advice.',
  );
  return out;
}
