import { Decimal } from 'decimal.js';
import { CPI_GENERAL_DIVISION } from '@everypaisa/shared';

/**
 * Pure personal-inflation math. No DB, no clock. Rates are fractions
 * (0.15 = 15%); CPI readings arrive as percents (5.54) and are converted here.
 */

const ONE = new Decimal(1);
const ZERO = new Decimal(0);
const DAY_MS = 86_400_000;

/**
 * A history shorter than this is not annualised: two fees five months apart
 * would turn a 5% bump into a 12%-a-year "trend".
 */
const MIN_HISTORY_DAYS = 330;

/**
 * Annualised long-run rate from same-month YoY readings (percent), one per
 * year: (∏(1 + pᵢ/100))^(1/n) − 1. Compounding the readings chains the two
 * MoSPI series without splicing their index levels.
 */
export function longRunRate(yoyPcts: readonly Decimal[]): Decimal | null {
  if (yoyPcts.length === 0) return null;
  const growth = yoyPcts.reduce((acc, p) => acc.times(ONE.plus(p.dividedBy(100))), ONE);
  if (growth.lessThanOrEqualTo(0)) return null;
  return growth.pow(ONE.dividedBy(yoyPcts.length)).minus(1);
}

export interface PricePoint {
  asOf: Date;
  amount: Decimal;
}

/** CAGR between the earliest and latest price points, or null if not meaningful. */
export function historyCagr(points: readonly PricePoint[]): { rate: Decimal; years: Decimal } | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (first.amount.lessThanOrEqualTo(0) || last.amount.lessThanOrEqualTo(0)) return null;
  const days = (last.asOf.getTime() - first.asOf.getTime()) / DAY_MS;
  if (days < MIN_HISTORY_DAYS) return null;
  const years = new Decimal(days).dividedBy('365.25');
  const rate = last.amount.dividedBy(first.amount).pow(ONE.dividedBy(years)).minus(1);
  return { rate, years };
}

export type RateMode = 'OFFICIAL' | 'CUSTOM' | 'HISTORY';
export type RateSource = 'OFFICIAL' | 'CUSTOM' | 'HISTORY';
export type RateNote = 'insufficient_history' | 'division_unavailable' | null;

export interface ItemRateInput {
  divisionCode: string;
  rateMode: RateMode;
  customRate: Decimal | null;
  pricePoints: readonly PricePoint[];
}

export interface ResolvedRate {
  rate: Decimal | null;
  source: RateSource;
  note: RateNote;
  /** Present whenever the history yields a CAGR, whatever the mode. */
  history: { rate: Decimal; years: Decimal } | null;
}

/**
 * The rate one basket item inflates at. HISTORY → the item's own CAGR;
 * CUSTOM → the typed rate; otherwise (or when those are unusable) the
 * official long-run rate of its division, then the headline rate.
 */
export function resolveItemRate(item: ItemRateInput, official: ReadonlyMap<string, Decimal>): ResolvedRate {
  const history = historyCagr(item.pricePoints);
  if (item.rateMode === 'HISTORY' && history) {
    return { rate: history.rate, source: 'HISTORY', note: null, history };
  }
  if (item.rateMode === 'CUSTOM' && item.customRate) {
    return { rate: item.customRate, source: 'CUSTOM', note: null, history };
  }
  let note: RateNote = item.rateMode === 'HISTORY' ? 'insufficient_history' : null;
  let rate = official.get(item.divisionCode) ?? null;
  if (rate === null) {
    rate = official.get(CPI_GENERAL_DIVISION) ?? null;
    if (rate !== null && note === null) note = 'division_unavailable';
  }
  return { rate, source: 'OFFICIAL', note, history };
}

/** Spend-weighted average rate. Items without a rate are left out. */
export function weightedRate(items: readonly { annualAmount: Decimal; rate: Decimal | null }[]): Decimal | null {
  let total = ZERO;
  let weighted = ZERO;
  for (const it of items) {
    if (it.rate === null || it.annualAmount.lessThanOrEqualTo(0)) continue;
    total = total.plus(it.annualAmount);
    weighted = weighted.plus(it.annualAmount.times(it.rate));
  }
  return total.isZero() ? null : weighted.dividedBy(total);
}

/** amount × (1 + rate)^years, annual compounding. */
export function projectAmount(amount: Decimal, rate: Decimal, years: number): Decimal {
  return amount.times(ONE.plus(rate).pow(years));
}

export function annualise(amount: Decimal, frequency: 'MONTHLY' | 'YEARLY'): Decimal {
  return frequency === 'MONTHLY' ? amount.times(12) : amount;
}

/**
 * Loan EMIs and life-cover premiums are not prices that rise: they repay the
 * same loan or buy the same cover every month. They stay on the page but are
 * left out of the basket, so they neither weigh down the personal rate nor
 * skew the totals. Health and motor premiums do rise, so they stay in.
 */
export function isOutsideBasket(item: { sourceRef: string | null; rateMode: RateMode; customRate: Decimal | null }): boolean {
  if (!item.sourceRef) return false;
  if (item.sourceRef.startsWith('loan:')) return true;
  return item.sourceRef.startsWith('insurance:') && item.rateMode === 'CUSTOM' && !!item.customRate?.isZero();
}

/** Return assumed for a goal's extra SIP when the goal has none of its own. */
export const DEFAULT_GOAL_RETURN = new Decimal('0.12');

/**
 * Monthly SIP, paid at the start of each month, that grows to `amount` in
 * `years` at `annualReturn` (fraction): the annual rate converted to its
 * equivalent monthly rate, (1 + r)^(1/12) − 1, then an annuity-due factor.
 */
export function monthlySipFor(amount: Decimal, years: number, annualReturn: Decimal): Decimal | null {
  if (amount.lessThanOrEqualTo(0) || !Number.isFinite(years) || years <= 0) return null;
  const months = Math.round(years * 12);
  if (months <= 0) return null;
  if (annualReturn.isZero()) return amount.dividedBy(months);
  const rm = ONE.plus(annualReturn).pow(ONE.dividedBy(12)).minus(1);
  const factor = ONE.plus(rm).pow(months).minus(1).dividedBy(rm).times(ONE.plus(rm));
  return amount.dividedBy(factor);
}
