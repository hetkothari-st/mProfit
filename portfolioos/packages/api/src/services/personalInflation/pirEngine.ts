import { Decimal } from 'decimal.js';
import {
  BASKET_CATEGORIES,
  CPI_GENERAL_DIVISION,
  DEFAULT_CATEGORY_CPI_DIVISION,
  isBasketCategory,
  isCpiDivisionCode,
  type BasketCategory,
} from '@everypaisa/shared';

/**
 * Personal inflation from bank spending (spec §6). Pure: no DB, no clock.
 *
 * - Weights: each basket category's share of the last 12 months' spend.
 * - Category rate: official CPI, blended with the user's own price change
 *   for fixed recurring payments (rent, fees) seen in both the current and
 *   previous 12 months: i_c = α·own + (1 − α)·CPI, α = share of the
 *   category's spend those payments cover.
 * - Step change: an own price change above +25% or below −10% is more likely
 *   a move or a new school than inflation, so CPI is used and the user asked.
 * - Confidence: min(1, months/12) × categorised share × account coverage,
 *   less 0.1 when card bills are counted without their line items.
 *
 * Rates are fractions (0.081 = 8.1%).
 */

export interface EngineParams {
  windowMonths: number;
  minConfidence: number;
  stepChangeUpper: number;
  stepChangeLower: number;
  /** Account coverage when no salary account is visible (spec §6.4). */
  partialCoverage: number;
  /** Months with an income credit for the salary account to count as visible. */
  incomeMonthsForCoverage: number;
  cardBillPenalty: number;
  /** Cash withdrawals above this share of debits may hide spending. */
  cashNoteShare: number;
}

export const DEFAULT_ENGINE_PARAMS: EngineParams = {
  windowMonths: 12,
  minConfidence: 0.6,
  stepChangeUpper: 0.25,
  stepChangeLower: -0.1,
  partialCoverage: 0.6,
  incomeMonthsForCoverage: 3,
  cardBillPenalty: 0.1,
  cashNoteShare: 0.15,
};

/** Fewest payments in each 12-month window before a series' own price is trusted. */
const MIN_PAYMENTS_PER_WINDOW: Record<string, number> = { MONTHLY: 3, QUARTERLY: 2, ANNUAL: 1 };

const ZERO = new Decimal(0);
const sum = (xs: readonly Decimal[]) => xs.reduce((s, x) => s.plus(x), ZERO);
const mean = (xs: readonly Decimal[]) => sum(xs).dividedBy(xs.length);

export interface MonthlyCategoryRow {
  month: string;
  category: string;
  amount: Decimal;
}

export interface SeriesPayments {
  id: string;
  payeeKey: string;
  category: string;
  cadence: string;
  isFixed: boolean;
  /** The user said the jump was a real price rise, not a move or a new school. */
  acceptOwnRate: boolean;
  /** Payment amounts in the current window. */
  current: Decimal[];
  /** Payment amounts in the 12 months before it. */
  previous: Decimal[];
}

export interface BankInputs {
  /** Debit totals per month and category, current window only, all categories. */
  months: readonly MonthlyCategoryRow[];
  series: readonly SeriesPayments[];
  /** Window months with an income credit. */
  incomeMonths: number;
  /** Card purchases seen in the window (alerts or statements). */
  cardPurchases: number;
  /** Division → CPI rate (the long-run rate, decision 3). */
  cpi: ReadonlyMap<string, Decimal>;
  categoryDivision?: Readonly<Record<BasketCategory, string>>;
  params?: EngineParams;
}

export type CategoryMethod = 'cpi' | 'own_price' | 'blend';

export interface BankCategoryRate {
  category: BasketCategory;
  divisionCode: string;
  /** Spend over the months seen, scaled to a year. */
  annualAmount: Decimal;
  cpiRate: Decimal | null;
  ownRate: Decimal | null;
  alpha: Decimal;
  rate: Decimal | null;
  method: CategoryMethod;
}

export interface StepChange {
  seriesId: string;
  payeeKey: string;
  category: string;
  rate: Decimal;
}

export interface BankBasis {
  ready: boolean;
  confidence: Decimal;
  monthsOfHistory: number;
  categorisedShare: Decimal;
  accountCoverage: Decimal;
  /** Card bills counted as other spending because no card line items were seen. */
  cardBillsCounted: boolean;
  /** Cash withdrawals are a large share of debits, so the rate may miss spending. */
  cashHeavy: boolean;
  categories: BankCategoryRate[];
  stepChanges: StepChange[];
  /** Σ w_c · i_c over the bank categories alone, or null when nothing is rated. */
  rate: Decimal | null;
}

/** The own price change of one fixed series, or null when there is not enough of it. */
export function seriesOwnRate(s: SeriesPayments): Decimal | null {
  if (!s.isFixed) return null;
  const need = MIN_PAYMENTS_PER_WINDOW[s.cadence] ?? 3;
  if (s.current.length < need || s.previous.length < need) return null;
  const prev = mean(s.previous);
  if (prev.lessThanOrEqualTo(0)) return null;
  // Average payment, so a window with a missed month still compares like
  // for like; with full windows this is annual_current / annual_previous − 1.
  return mean(s.current).dividedBy(prev).minus(1);
}

/** Months 'YYYY-MM' in the window ending the month before `now` (newest last). */
export function windowMonths(now: Date, count: number, offset = 0): string[] {
  const out: string[] = [];
  for (let i = count + offset; i > offset; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function bankBasis(input: BankInputs): BankBasis {
  const p = input.params ?? DEFAULT_ENGINE_PARAMS;
  const map = input.categoryDivision ?? DEFAULT_CATEGORY_CPI_DIVISION;
  const cpiFor = (division: string) => input.cpi.get(division) ?? input.cpi.get(CPI_GENERAL_DIVISION) ?? null;

  const spend = new Map<string, Decimal>();
  const monthsSeen = new Set<string>();
  let debits = ZERO;
  for (const m of input.months) {
    if (m.amount.lessThanOrEqualTo(0)) continue;
    monthsSeen.add(m.month);
    debits = debits.plus(m.amount);
    spend.set(m.category, (spend.get(m.category) ?? ZERO).plus(m.amount));
  }
  const monthsOfHistory = monthsSeen.size;

  // Card bills without the card's own line items: count them as other spending.
  const cardBills = spend.get('credit_card_bill') ?? ZERO;
  const cardBillsCounted = cardBills.greaterThan(0) && input.cardPurchases === 0;
  if (cardBillsCounted) spend.set('other_consumption', (spend.get('other_consumption') ?? ZERO).plus(cardBills));

  // Own price per fixed series, minus step changes the user has not confirmed.
  const own = new Map<string, { covered: Decimal; weighted: Decimal }>();
  const stepChanges: StepChange[] = [];
  for (const s of input.series) {
    if (!isBasketCategory(s.category)) continue;
    const r = seriesOwnRate(s);
    if (r === null) continue;
    const step = r.greaterThan(p.stepChangeUpper) || r.lessThan(p.stepChangeLower);
    if (step && !s.acceptOwnRate) {
      stepChanges.push({ seriesId: s.id, payeeKey: s.payeeKey, category: s.category, rate: r });
      continue;
    }
    const paid = sum(s.current);
    const o = own.get(s.category) ?? { covered: ZERO, weighted: ZERO };
    own.set(s.category, { covered: o.covered.plus(paid), weighted: o.weighted.plus(paid.times(r)) });
  }

  const scale = monthsOfHistory === 0 ? ZERO : new Decimal(12).dividedBy(monthsOfHistory);
  const categories: BankCategoryRate[] = [];
  for (const category of BASKET_CATEGORIES) {
    const s = spend.get(category);
    if (!s || s.lessThanOrEqualTo(0)) continue;
    const divisionCode = map[category];
    const cpiRate = cpiFor(divisionCode);
    const o = own.get(category);
    const ownRate = o && o.covered.greaterThan(0) ? o.weighted.dividedBy(o.covered) : null;
    const alpha = o ? Decimal.min(1, o.covered.dividedBy(s)) : ZERO;
    let rate: Decimal | null;
    let method: CategoryMethod;
    if (ownRate === null || alpha.isZero()) {
      rate = cpiRate;
      method = 'cpi';
    } else if (alpha.greaterThanOrEqualTo(1) || cpiRate === null) {
      rate = ownRate;
      method = 'own_price';
    } else {
      rate = alpha.times(ownRate).plus(new Decimal(1).minus(alpha).times(cpiRate));
      method = 'blend';
    }
    categories.push({ category, divisionCode, annualAmount: s.times(scale), cpiRate, ownRate, alpha, rate, method });
  }

  const uncategorised = spend.get('uncategorised') ?? ZERO;
  const categorisedShare = debits.isZero() ? ZERO : new Decimal(1).minus(uncategorised.dividedBy(debits));
  const accountCoverage = new Decimal(input.incomeMonths >= p.incomeMonthsForCoverage ? 1 : p.partialCoverage);
  let confidence = Decimal.min(1, new Decimal(monthsOfHistory).dividedBy(p.windowMonths))
    .times(categorisedShare)
    .times(accountCoverage);
  if (cardBillsCounted) confidence = Decimal.max(0, confidence.minus(p.cardBillPenalty));

  const cash = spend.get('cash_withdrawal') ?? ZERO;
  const cashHeavy = !debits.isZero() && cash.dividedBy(debits).greaterThan(p.cashNoteShare);

  let total = ZERO;
  let weighted = ZERO;
  for (const c of categories) {
    if (c.rate === null) continue;
    total = total.plus(c.annualAmount);
    weighted = weighted.plus(c.annualAmount.times(c.rate));
  }

  return {
    ready: confidence.greaterThanOrEqualTo(p.minConfidence),
    confidence,
    monthsOfHistory,
    categorisedShare,
    accountCoverage,
    cardBillsCounted,
    cashHeavy,
    categories,
    stepChanges,
    rate: total.isZero() ? null : weighted.dividedBy(total),
  };
}

/**
 * The category → CPI division map with an admin override (AppSetting
 * `personalInflation.categoryCpiMap`) laid over the default. Unknown
 * categories and division codes in the override are ignored.
 */
export function categoryDivisionMap(override: unknown): Record<BasketCategory, string> {
  const out = { ...DEFAULT_CATEGORY_CPI_DIVISION };
  if (override && typeof override === 'object' && !Array.isArray(override)) {
    for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
      if (isBasketCategory(k) && typeof v === 'string' && isCpiDivisionCode(v)) out[k] = v;
    }
  }
  return out;
}

/** Engine parameters with an admin override (AppSetting `personalInflation.engine`); bad values are ignored. */
export function engineParams(override: unknown): EngineParams {
  const out = { ...DEFAULT_ENGINE_PARAMS };
  if (override && typeof override === 'object' && !Array.isArray(override)) {
    for (const key of Object.keys(out) as (keyof EngineParams)[]) {
      const v = (override as Record<string, unknown>)[key];
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    }
  }
  return out;
}
