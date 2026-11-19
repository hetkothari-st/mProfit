import { Decimal } from 'decimal.js';
import { prisma } from '../../lib/prisma.js';
import { resolveMutualFundId, resolveStockMasterId } from './masterData.service.js';

/**
 * A gentle sanity check on the price a user types for a listed stock, ETF or mutual fund: compare it with
 * what that instrument actually traded or was valued at on the trade date. The most common data-entry
 * slips are a stray zero, paise typed as rupees, or the total amount typed where the price belongs; each
 * one distorts cost basis and capital gains for years, and nothing downstream notices.
 *
 * It is advice, never a gate: the caller decides what to do with a warning. Anything we cannot judge
 * (no price history, an instrument we do not track, a date with no data, history adjusted for a later
 * split or bonus) answers "unknown" rather than guessing.
 */

export type ReferenceKind = 'CLOSE' | 'NAV';

export interface PriceReference {
  kind: ReferenceKind;
  /** Day's close, or the fund's NAV. */
  value: Decimal;
  /** The date the reference belongs to (may be a few days before the trade date: weekend, holiday). */
  date: string;
  /** The day's range, for stocks. */
  low?: Decimal;
  high?: Decimal;
}

export type PriceVerdict =
  | { status: 'ok'; reference: PriceReference }
  | {
      status: 'warn';
      code: 'OFF_MARKET' | 'LIKELY_UNIT_SLIP';
      reference: PriceReference;
      /** Entered price relative to the reference, as a signed percentage, e.g. "900.00". */
      diffPct: string;
      /** Plain-English guess at the slip, when the ratio looks like one. */
      hint: string | null;
    }
  | { status: 'unknown'; reason: UnknownReason };

export type UnknownReason =
  | 'NOT_CHECKED_ASSET'
  | 'NO_INSTRUMENT'
  | 'NO_PRICE_HISTORY'
  | 'ADJUSTED_HISTORY'
  | 'FUTURE_DATE'
  | 'BAD_INPUT';

/** Prices further than this from the day's close/NAV (and outside the day's range) are flagged. */
export const STOCK_TOLERANCE = new Decimal('0.10');
export const NAV_TOLERANCE = new Decimal('0.10');
/** A stock trade can print a little outside the day's recorded high/low (feed rounding, auction). */
const RANGE_SLACK = new Decimal('0.02');
/** How far back to look for the nearest earlier price when the trade date was a weekend or holiday. */
export const LOOKBACK_DAYS = 7;

const DAY_MS = 86_400_000;

/** Ratios that look like a decimal-point slip, with what the user most likely did. */
const SLIPS: Array<{ ratio: number; hint: string }> = [
  { ratio: 100, hint: 'This is about 100 times the market price: it may be in paise, or have two extra digits.' },
  { ratio: 10, hint: 'This is about 10 times the market price: check for an extra zero.' },
  { ratio: 1000, hint: 'This is about 1,000 times the market price: check for extra digits.' },
  { ratio: 0.1, hint: 'This is about a tenth of the market price: a digit may be missing.' },
  { ratio: 0.01, hint: 'This is about 1% of the market price: it may be in rupees where paise are expected, or a digit is missing.' },
];

function slipHint(price: Decimal, ref: Decimal): string | null {
  if (ref.isZero()) return null;
  const ratio = price.dividedBy(ref);
  for (const s of SLIPS) {
    const target = new Decimal(s.ratio);
    if (ratio.minus(target).abs().dividedBy(target).lessThanOrEqualTo('0.08')) return s.hint;
  }
  return null;
}

/** Pure comparison of an entered price against a reference; no I/O. */
export function judgePrice(price: Decimal, ref: PriceReference): PriceVerdict {
  if (!price.isFinite() || price.lessThanOrEqualTo(0) || ref.value.lessThanOrEqualTo(0)) {
    return { status: 'unknown', reason: 'BAD_INPUT' };
  }
  const diff = price.minus(ref.value).dividedBy(ref.value);
  const tolerance = ref.kind === 'NAV' ? NAV_TOLERANCE : STOCK_TOLERANCE;

  const insideRange =
    ref.low !== undefined &&
    ref.high !== undefined &&
    price.greaterThanOrEqualTo(ref.low.times(new Decimal(1).minus(RANGE_SLACK))) &&
    price.lessThanOrEqualTo(ref.high.times(new Decimal(1).plus(RANGE_SLACK)));

  if (insideRange || diff.abs().lessThanOrEqualTo(tolerance)) return { status: 'ok', reference: ref };

  const hint = slipHint(price, ref.value);
  return {
    status: 'warn',
    code: hint ? 'LIKELY_UNIT_SLIP' : 'OFF_MARKET',
    reference: ref,
    diffPct: diff.times(100).toFixed(2),
    hint,
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface PriceCheckInput {
  assetClass: string;
  stockSymbol?: string;
  schemeCode?: string;
  isin?: string;
  /** YYYY-MM-DD */
  tradeDate: string;
  price: string;
  now?: Date;
}

const STOCK_CLASSES = new Set(['EQUITY', 'ETF']);

/** The close/NAV reference for an instrument on or just before a date, or why there is none. */
export async function checkTradePrice(input: PriceCheckInput): Promise<PriceVerdict> {
  const isStock = STOCK_CLASSES.has(input.assetClass);
  const isFund = input.assetClass === 'MUTUAL_FUND';
  if (!isStock && !isFund) return { status: 'unknown', reason: 'NOT_CHECKED_ASSET' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.tradeDate)) return { status: 'unknown', reason: 'BAD_INPUT' };
  let price: Decimal;
  try {
    price = new Decimal(input.price);
  } catch {
    return { status: 'unknown', reason: 'BAD_INPUT' };
  }

  const tradeDay = new Date(`${input.tradeDate}T00:00:00.000Z`);
  const now = input.now ?? new Date();
  if (tradeDay.getTime() > now.getTime() + DAY_MS) return { status: 'unknown', reason: 'FUTURE_DATE' };
  const from = new Date(tradeDay.getTime() - LOOKBACK_DAYS * DAY_MS);

  if (isStock) {
    const stockId = await resolveStockMasterId({ symbol: input.stockSymbol, isin: input.isin });
    if (!stockId) return { status: 'unknown', reason: 'NO_INSTRUMENT' };

    // Stored history is adjusted for splits and bonuses, so a price typed as it was on the day would
    // look wrong after one. The report-side check skips these for the same reason.
    const laterAction = await prisma.corporateAction.findFirst({
      where: { stockId, type: { in: ['SPLIT', 'BONUS', 'MERGER', 'DEMERGER'] }, exDate: { gt: tradeDay } },
      select: { id: true },
    });
    if (laterAction) return { status: 'unknown', reason: 'ADJUSTED_HISTORY' };

    const row = await prisma.stockPrice.findFirst({
      where: { stockId, date: { gte: from, lte: tradeDay } },
      orderBy: { date: 'desc' },
      select: { date: true, close: true, low: true, high: true },
    });
    if (!row) return { status: 'unknown', reason: 'NO_PRICE_HISTORY' };
    return judgePrice(price, {
      kind: 'CLOSE',
      value: new Decimal(row.close.toString()),
      low: new Decimal(row.low.toString()),
      high: new Decimal(row.high.toString()),
      date: iso(row.date),
    });
  }

  const fundId = await resolveMutualFundId({ schemeCode: input.schemeCode, isin: input.isin });
  if (!fundId) return { status: 'unknown', reason: 'NO_INSTRUMENT' };
  const nav = await prisma.mFNav.findFirst({
    where: { fundId, date: { gte: from, lte: tradeDay } },
    orderBy: { date: 'desc' },
    select: { date: true, nav: true },
  });
  if (!nav) return { status: 'unknown', reason: 'NO_PRICE_HISTORY' };
  return judgePrice(price, { kind: 'NAV', value: new Decimal(nav.nav.toString()), date: iso(nav.date) });
}

/** The wire shape: money and percentages as strings (money is never a JSON number). */
export function toPriceCheckDTO(v: PriceVerdict) {
  if (v.status === 'unknown') return { status: 'unknown' as const, reason: v.reason };
  const reference = {
    kind: v.reference.kind,
    value: v.reference.value.toString(),
    date: v.reference.date,
    low: v.reference.low?.toString() ?? null,
    high: v.reference.high?.toString() ?? null,
  };
  if (v.status === 'ok') return { status: 'ok' as const, reference };
  return { status: 'warn' as const, code: v.code, reference, diffPct: v.diffPct, hint: v.hint };
}
