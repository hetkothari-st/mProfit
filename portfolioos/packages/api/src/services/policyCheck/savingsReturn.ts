/**
 * Savings-plan return maths. Pure; money is Decimal end to end.
 *
 *  - guaranteedReturn(): the annual return a policy gives if every premium is
 *    paid and ONLY the guaranteed maturity benefit is received. Bonuses and
 *    illustrated figures are never counted.
 *  - calculateSavingsReturn(): the "what if I keep it / exit today" calculator.
 *    The surrender value is whatever the user types from the insurer's quote;
 *    we never estimate one.
 *
 * Premiums are modelled as one annual payment at the start of each policy year
 * (an approximation when premiums are monthly or quarterly; stated in the
 * assumptions).
 */

import { Decimal, serializeMoney, xirr } from '@everypaisa/shared';
import type { Money, SavingsReturnInput, SavingsReturnOutput } from '@everypaisa/shared';
import type { SavingsExtraction } from './savingsExtractionSchema.js';

export const DEFAULT_BENCHMARK_PCT = 7;
export const MAX_BENCHMARK_PCT = 20;

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
const pct = (r: number | null): string | null => (r === null ? null : (r * 100).toFixed(2));

/** Year n after a fixed base, as exactly n x 365 days (leap days would skew the rate). */
function yearDate(n: number): Date {
  return new Date(Date.UTC(2001, 0, 1) + n * 365 * 86_400_000);
}

export interface PlanTerms {
  premium: Decimal;
  premiumYears: number;
  termYears: number;
  maturity: Decimal | null;
}

export function planTerms(x: SavingsExtraction): PlanTerms | null {
  const premium = dec(val<string>(x.premiumAmountInr));
  const term = val<number>(x.policyTermYears);
  if (!premium || premium.isZero() || !term) return null;
  const ppt = val<number>(x.premiumPayingTermYears) ?? term;
  return {
    premium,
    premiumYears: Math.min(ppt, term),
    termYears: term,
    maturity: dec(val<string>(x.maturityBenefitGuaranteedInr)),
  };
}

/** Annual return (fraction, 0.05 = 5%) on the guaranteed maturity benefit, or null if not computable. */
export function guaranteedReturn(x: SavingsExtraction): number | null {
  const t = planTerms(x);
  if (!t || !t.maturity || t.maturity.isZero()) return null;
  const flows = [];
  for (let y = 0; y < t.premiumYears; y++) flows.push({ date: yearDate(y), amount: t.premium.neg() });
  flows.push({ date: yearDate(t.termYears), amount: t.maturity });
  return xirr(flows);
}

/** Future value of `premiumYears` annual payments at the start of each year, compounded to `termYears`. */
function futureValueAtBenchmark(premium: Decimal, premiumYears: number, termYears: number, ratePct: number): Decimal {
  const g = new Decimal(1).plus(new Decimal(ratePct).div(100));
  let total = new Decimal(0);
  for (let y = 0; y < premiumYears; y++) total = total.plus(premium.mul(g.pow(termYears - y)));
  return total;
}

export function calculateSavingsReturn(
  input: SavingsReturnInput,
  x: SavingsExtraction,
  planKind: 'ULIP' | 'TRADITIONAL',
): SavingsReturnOutput {
  const missing: string[] = [];
  const assumptions: string[] = [];

  let bench = input.benchmarkRatePct ?? DEFAULT_BENCHMARK_PCT;
  if (!Number.isFinite(bench) || bench < 0 || bench > MAX_BENCHMARK_PCT) {
    assumptions.push(`Comparison rate must be between 0% and ${MAX_BENCHMARK_PCT}%; using ${DEFAULT_BENCHMARK_PCT}%.`);
    bench = DEFAULT_BENCHMARK_PCT;
  }

  const t = planTerms(x);
  if (!t) missing.push('annual premium and policy term (not found in the documents)');

  const years = input.yearsPaid;
  const yearsOk = years !== null && Number.isInteger(years) && years >= 1 && (!t || years <= t.termYears);
  if (!yearsOk) missing.push('years of premiums paid so far');

  const exitRaw = planKind === 'ULIP' ? input.fundValueNowInr : input.surrenderValueNowInr;
  const exit = dec(exitRaw);
  if (exit === null) missing.push(planKind === 'ULIP' ? 'fund value from your latest statement' : 'surrender value quoted by the insurer');

  const out: SavingsReturnOutput = {
    totalPremiumsInr: null,
    guaranteedMaturityInr: null,
    guaranteedReturnPct: null,
    benchmarkValueAtMaturityInr: null,
    premiumsPaidSoFarInr: null,
    exitValueNowInr: null,
    gainOrLossOnExitInr: null,
    returnIfExitNowPct: null,
    returnOnStayingPct: null,
    summary: '',
    assumptions,
    missingInputs: missing,
  };

  if (t) {
    out.totalPremiumsInr = fmt(t.premium.mul(t.premiumYears));
    out.benchmarkValueAtMaturityInr = fmt(futureValueAtBenchmark(t.premium, t.premiumYears, t.termYears, bench));
    if (t.maturity) {
      out.guaranteedMaturityInr = fmt(t.maturity);
      out.guaranteedReturnPct = pct(guaranteedReturn(x));
    } else if (planKind === 'TRADITIONAL') {
      missing.push('guaranteed maturity benefit (not stated in the documents; bonuses are not guaranteed)');
    }
  }

  if (t && yearsOk && exit !== null) {
    const paid = t.premium.mul(Math.min(years!, t.premiumYears));
    out.premiumsPaidSoFarInr = fmt(paid);
    out.exitValueNowInr = fmt(exit);
    out.gainOrLossOnExitInr = fmt(exit.minus(paid));

    const past = [];
    for (let y = 0; y < Math.min(years!, t.premiumYears); y++) past.push({ date: yearDate(y), amount: t.premium.neg() });
    past.push({ date: yearDate(years!), amount: exit });
    out.returnIfExitNowPct = pct(xirr(past));

    // Staying: you give up the exit value today, keep paying the remaining premiums, then collect the maturity benefit.
    if (t.maturity && !t.maturity.isZero()) {
      const flows = [{ date: yearDate(0), amount: exit.neg() }];
      for (let y = years!; y < t.premiumYears; y++) flows.push({ date: yearDate(y - years!), amount: t.premium.neg() });
      flows.push({ date: yearDate(t.termYears - years!), amount: t.maturity });
      out.returnOnStayingPct = pct(xirr(flows));
    }
  }

  assumptions.push(
    'Premiums are treated as one annual payment at the start of each policy year.',
    'Only the guaranteed maturity benefit is counted. Bonuses, illustrated values and fund growth are not.',
    planKind === 'ULIP'
      ? 'Exit value is the fund value you entered. A ULIP can only be exited after its lock-in, and some charges may still apply.'
      : 'Exit value is the surrender value you entered from the insurer’s quote; we do not estimate it.',
    'Ignores tax, the life cover you give up on exit, and any loans against the policy.',
    'A way to compare, not financial advice.',
  );

  out.summary = buildSummary(out, bench);
  return out;
}

function buildSummary(o: SavingsReturnOutput, bench: number): string {
  const parts: string[] = [];
  if (o.guaranteedReturnPct !== null) {
    parts.push(`If you pay every premium and receive only the guaranteed benefit, this policy returns about ${o.guaranteedReturnPct}% a year.`);
  }
  if (o.returnOnStayingPct !== null) {
    const stay = Number(o.returnOnStayingPct);
    parts.push(
      `Staying in earns about ${o.returnOnStayingPct}% a year on the money you leave in, ` +
        (stay >= bench ? `at or above the ${bench}% comparison rate.` : `below the ${bench}% comparison rate.`),
    );
  }
  if (o.returnIfExitNowPct !== null) {
    parts.push(`Exiting today would mean about ${o.returnIfExitNowPct}% a year on what you have paid so far.`);
  }
  if (parts.length === 0) return 'Enter the details below to compare keeping this policy with exiting it.';
  return parts.join(' ');
}
