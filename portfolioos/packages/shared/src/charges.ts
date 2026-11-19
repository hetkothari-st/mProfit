import { Decimal } from 'decimal.js';

/**
 * Estimate of the statutory charges on a listed-share trade, so a user adding a trade by hand does not
 * have to look up STT, stamp duty, exchange and SEBI fees and GST on the contract note.
 *
 * It is an ESTIMATE of the standard cash-segment rates. Brokerage and depository (DP) charges depend on
 * the broker and are not guessed; the user's own brokerage figure, if given, is included in the GST base.
 * Rates change from time to time, so they live here in one place with the date they were last reviewed,
 * and the screen tells the user to compare with the contract note.
 */
export const CHARGE_RATES_AS_OF = '2025-10';

/** Percent of turnover (quantity x price). */
export const CHARGE_RATES_PCT = {
  /** Delivery: charged on both buy and sell. */
  sttDelivery: '0.1',
  /** Intraday: sell side only. */
  sttIntradaySell: '0.025',
  /** Stamp duty is levied on the buyer only. */
  stampDeliveryBuy: '0.015',
  stampIntradayBuy: '0.003',
  /** Exchange transaction charges, equity cash segment. */
  exchangeNse: '0.00297',
  exchangeBse: '0.00375',
  /** SEBI turnover fee: Rs 10 per crore. */
  sebi: '0.0001',
} as const;

export const GST_ON_CHARGES_PCT = '18';

export interface ChargeEstimateInput {
  side: 'BUY' | 'SELL';
  quantity: Decimal.Value;
  price: Decimal.Value;
  exchange?: 'NSE' | 'BSE';
  /** Square-off on the same day, no delivery. */
  intraday?: boolean;
  /** The user's own brokerage for this trade, if known (it attracts GST). */
  brokerage?: Decimal.Value;
}

export interface ChargeEstimate {
  /** All amounts in rupees as strings with two decimals (STT is whole rupees, as on contract notes). */
  stt: string;
  stampDuty: string;
  exchangeCharges: string;
  sebiCharges: string;
  gst: string;
}

const pct = (turnover: Decimal, rate: string): Decimal => turnover.times(rate).dividedBy(100);
const money = (d: Decimal): string => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

/** Null when the inputs cannot describe a trade (non-positive or unparseable quantity or price). */
export function estimateEquityCharges(input: ChargeEstimateInput): ChargeEstimate | null {
  let qty: Decimal;
  let price: Decimal;
  let brokerage: Decimal;
  try {
    qty = new Decimal(input.quantity);
    price = new Decimal(input.price);
    brokerage = new Decimal(input.brokerage ?? 0);
  } catch {
    return null;
  }
  if (!qty.isFinite() || !price.isFinite() || qty.lessThanOrEqualTo(0) || price.lessThanOrEqualTo(0)) return null;
  if (!brokerage.isFinite() || brokerage.isNegative()) brokerage = new Decimal(0);

  const turnover = qty.times(price);
  const intraday = input.intraday === true;

  let sttRaw: Decimal;
  if (intraday) sttRaw = input.side === 'SELL' ? pct(turnover, CHARGE_RATES_PCT.sttIntradaySell) : new Decimal(0);
  else sttRaw = pct(turnover, CHARGE_RATES_PCT.sttDelivery);
  // STT is rounded to the nearest rupee.
  const stt = sttRaw.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const stamp =
    input.side === 'BUY'
      ? pct(turnover, intraday ? CHARGE_RATES_PCT.stampIntradayBuy : CHARGE_RATES_PCT.stampDeliveryBuy)
      : new Decimal(0);
  const exchange = pct(turnover, input.exchange === 'BSE' ? CHARGE_RATES_PCT.exchangeBse : CHARGE_RATES_PCT.exchangeNse);
  const sebi = pct(turnover, CHARGE_RATES_PCT.sebi);
  // GST is on brokerage and the exchange and SEBI fees, not on STT or stamp duty.
  const gst = brokerage.plus(exchange).plus(sebi).times(GST_ON_CHARGES_PCT).dividedBy(100);

  return {
    stt: stt.toFixed(2),
    stampDuty: money(stamp),
    exchangeCharges: money(exchange),
    sebiCharges: money(sebi),
    gst: money(gst),
  };
}
