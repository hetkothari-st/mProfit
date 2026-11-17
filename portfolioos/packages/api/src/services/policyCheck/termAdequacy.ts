/**
 * Cover adequacy calculator for term life. Pure Decimal math.
 *
 *   need      = annual income x years to replace + outstanding loans - liquid assets  (never below 0)
 *   cover     = this policy's sum assured + other life cover
 *   shortfall = max(0, need - cover)
 *
 * A deliberately simple, transparent rule of thumb. It ignores inflation, tax,
 * future goals (children's education, a spouse's own income) and the family's
 * actual expenses — and says so. It is not financial advice.
 */

import { Decimal, serializeMoney } from '@everypaisa/shared';
import type { Money, TermAdequacyInput, TermAdequacyOutput } from '@everypaisa/shared';

export const DEFAULT_YEARS_TO_REPLACE = 15;
export const MIN_YEARS = 5;
export const MAX_YEARS = 30;

function toD(v: string | null | undefined): Decimal | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    const x = new Decimal(v);
    return x.isFinite() && x.gte(0) ? x : null;
  } catch {
    return null;
  }
}

const fmt = (d: Decimal): Money => serializeMoney(d.toDecimalPlaces(0));

export function calculateTermAdequacy(input: TermAdequacyInput, policySumAssured: string | null): TermAdequacyOutput {
  const missing: string[] = [];

  const income = toD(input.annualIncomeInr);
  if (!income || income.isZero()) {
    throw new Error('annualIncomeInr is required and must be a positive amount');
  }

  let years = input.yearsOfIncomeToReplace ?? DEFAULT_YEARS_TO_REPLACE;
  const assumptions: string[] = [];
  if (!Number.isFinite(years) || years < MIN_YEARS || years > MAX_YEARS) {
    assumptions.push(`Years to replace must be between ${MIN_YEARS} and ${MAX_YEARS}; using ${DEFAULT_YEARS_TO_REPLACE}.`);
    years = DEFAULT_YEARS_TO_REPLACE;
  }

  const loans = toD(input.outstandingLoansInr);
  if (loans === null) missing.push('outstandingLoansInr (counted as ₹0)');
  const assets = toD(input.liquidAssetsInr);
  if (assets === null) missing.push('liquidAssetsInr (counted as ₹0)');
  const other = toD(input.otherLifeCoverInr);
  if (other === null) missing.push('otherLifeCoverInr (counted as ₹0)');
  const policy = toD(policySumAssured);
  if (policy === null) missing.push('this policy’s sum assured (not found in the documents; counted as ₹0)');

  const replacement = income.mul(years);
  const need = Decimal.max(replacement.plus(loans ?? 0).minus(assets ?? 0), new Decimal(0));
  const cover = (policy ?? new Decimal(0)).plus(other ?? 0);
  const shortfall = Decimal.max(need.minus(cover), new Decimal(0));

  assumptions.push(
    `Income replacement = annual income × ${years} years.`,
    'Outstanding loans are added; liquid assets are subtracted.',
    'Ignores inflation, tax, future goals (education, a spouse’s income) and your family’s actual expenses.',
    'A rule of thumb to start a conversation, not financial advice.',
  );

  const summary = shortfall.isZero()
    ? 'On these assumptions, this policy and your other cover meet the estimated need.'
    : `On these assumptions your cover is about ₹${shortfall.toDecimalPlaces(0).toFixed(0)} short of the estimated need.`;

  return {
    incomeReplacementInr: fmt(replacement),
    totalNeedInr: fmt(need),
    totalCoverInr: fmt(cover),
    shortfallInr: fmt(shortfall),
    summary,
    assumptions,
    missingInputs: missing,
  };
}
