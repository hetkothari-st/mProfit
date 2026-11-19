import { formatDateOnly, formatINR } from '@everypaisa/shared';

/** What GET /api/transactions/price-check returns. Money and percentages are strings. */
export interface PriceCheckResult {
  status: 'ok' | 'warn' | 'unknown';
  code?: 'OFF_MARKET' | 'LIKELY_UNIT_SLIP';
  reason?: string;
  diffPct?: string;
  hint?: string | null;
  reference?: { kind: 'CLOSE' | 'NAV'; value: string; date: string; low: string | null; high: string | null };
}

/** Trade types whose price is the market price or NAV of the day; rights, bonuses etc. are not. */
export const PRICE_CHECKED_TYPES: ReadonlySet<string> = new Set([
  'BUY', 'SELL', 'SIP', 'REDEMPTION', 'SWITCH_IN', 'SWITCH_OUT',
]);
export const PRICE_CHECKED_CLASSES: ReadonlySet<string> = new Set(['EQUITY', 'ETF', 'MUTUAL_FUND']);

/** Whether the form has everything the check needs: a listed instrument, a date, and a positive price. */
export function canCheckPrice(v: {
  assetClass: string;
  transactionType: string;
  stockSymbol?: string;
  schemeCode?: string;
  tradeDate: string;
  price: number | string | null | undefined;
}): boolean {
  if (!PRICE_CHECKED_CLASSES.has(v.assetClass) || !PRICE_CHECKED_TYPES.has(v.transactionType)) return false;
  const hasInstrument = v.assetClass === 'MUTUAL_FUND' ? Boolean(v.schemeCode) : Boolean(v.stockSymbol);
  if (!hasInstrument || !/^\d{4}-\d{2}-\d{2}$/.test(v.tradeDate)) return false;
  const p = Number(v.price);
  return Number.isFinite(p) && p > 0;
}

/** The sentence shown under the price field; null when there is nothing worth saying. */
export function describePriceCheck(r: PriceCheckResult | undefined): { text: string; hint: string | null } | null {
  if (!r || r.status !== 'warn' || !r.reference) return null;
  const ref = r.reference;
  const what = ref.kind === 'NAV' ? 'NAV' : 'closing price';
  const pct = Number(r.diffPct);
  const dir = pct >= 0 ? 'higher' : 'lower';
  const size = Math.abs(pct) >= 1000 ? 'far' : `${Math.abs(pct).toFixed(0)}%`;
  const when = formatDateOnly(ref.date);
  return {
    text:
      `The ${what} on ${when} was ${formatINR(ref.value)}; the price you entered is ${size} ${dir === 'higher' ? 'higher' : 'lower'}.`,
    hint: r.hint ?? null,
  };
}
