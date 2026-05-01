import { createHash } from 'node:crypto';
import type { Transaction } from '@prisma/client';

/**
 * Canonical identity of a holding's underlying instrument — the key Phase 4.5+
 * code uses to group Transactions into a HoldingProjection or
 * DerivativePosition row. Mirrors the precedence baked into migrations
 * `20260421120000_phase_4_5_hardening` (§4.10 step 2) and
 * `20260501120000_fno_schema`, so that in-process writes produce the same
 * key the DB backfill produced for existing rows. Changing the precedence
 * here without a reconciling migration will silently split or merge holdings.
 *
 * Precedence:
 *   1. F&O (futures/options)
 *        → "fno:<UPPER(underlying)>:<FUT|CE|PE>:<strike padded 6>:<YYYY-MM-DD>"
 *        Strike is left-padded to 6 chars so "CE:500" and "CE:5000" do
 *        not collide and so string ordering matches numeric ordering.
 *   2. stockId  → "stock:<id>"
 *   3. fundId   → "fund:<id>"
 *   4. isin     → "isin:<ISIN>"  (non-empty)
 *   5. fallback → "name:<sha256(lower(trim(assetName||'')))>"
 *
 * The final fallback guarantees a non-null key for assets that live entirely
 * in the Transaction row (FDs, bonds, NPS, gold, insurance, etc.) — the class
 * of asset that made BUG-001 possible in the first place.
 */
export interface AssetKeyRefs {
  stockId?: string | null;
  fundId?: string | null;
  isin?: string | null;
  assetName?: string | null;

  // F&O — when present, takes precedence so an option chain's many strikes
  // each get a distinct key. See `assetKeyFromTransaction` for how the
  // existing schema (Transaction.assetClass + optionType + strikePrice +
  // expiryDate + assetName/stock.symbol) feeds this.
  foUnderlying?: string | null;
  foInstrumentType?: 'FUTURES' | 'CALL' | 'PUT' | null;
  foStrikePrice?: string | number | null;
  foExpiryDate?: string | null; // YYYY-MM-DD
}

function padStrike(s: string | number | null | undefined): string {
  if (s === null || s === undefined || s === '') return '000000';
  // Drop fractional and any non-digit; pad. Indian F&O strikes are integers.
  const intPart = String(s).split('.')[0]!.replace(/\D/g, '');
  return (intPart || '0').padStart(6, '0');
}

function fmtFoType(t: 'FUTURES' | 'CALL' | 'PUT'): string {
  return t === 'FUTURES' ? 'FUT' : t === 'CALL' ? 'CE' : 'PE';
}

export function computeAssetKey(refs: AssetKeyRefs): string {
  if (refs.foUnderlying && refs.foInstrumentType && refs.foExpiryDate) {
    const type = fmtFoType(refs.foInstrumentType);
    const strike = type === 'FUT' ? '000000' : padStrike(refs.foStrikePrice);
    return `fno:${refs.foUnderlying.toUpperCase()}:${type}:${strike}:${refs.foExpiryDate}`;
  }
  if (refs.stockId) return `stock:${refs.stockId}`;
  if (refs.fundId) return `fund:${refs.fundId}`;
  if (refs.isin && refs.isin.trim() !== '') return `isin:${refs.isin}`;
  const normalized = (refs.assetName ?? '').trim().toLowerCase();
  return `name:${createHash('sha256').update(normalized).digest('hex')}`;
}

type FoTransactionRefs = Pick<
  Transaction,
  'stockId' | 'fundId' | 'isin' | 'assetName' | 'assetClass' | 'optionType' | 'strikePrice' | 'expiryDate'
> & {
  // Optional joined master-data symbol — preferred underlying source when
  // available (e.g. "NIFTY" rather than the messy assetName from the PDF).
  stockSymbol?: string | null;
};

export function assetKeyFromTransaction(tx: FoTransactionRefs): string {
  const isFno = tx.assetClass === 'FUTURES' || tx.assetClass === 'OPTIONS';
  if (isFno && tx.expiryDate) {
    const instrumentType: 'FUTURES' | 'CALL' | 'PUT' =
      tx.assetClass === 'FUTURES'
        ? 'FUTURES'
        : tx.optionType === 'PUT'
          ? 'PUT'
          : 'CALL';
    const underlying =
      tx.stockSymbol ?? extractUnderlyingFromAssetName(tx.assetName) ?? tx.assetName ?? 'UNKNOWN';
    return computeAssetKey({
      foUnderlying: underlying,
      foInstrumentType: instrumentType,
      foStrikePrice: tx.strikePrice ? tx.strikePrice.toString() : null,
      foExpiryDate:
        tx.expiryDate instanceof Date
          ? tx.expiryDate.toISOString().slice(0, 10)
          : String(tx.expiryDate).slice(0, 10),
    });
  }
  return computeAssetKey({
    stockId: tx.stockId,
    fundId: tx.fundId,
    isin: tx.isin,
    assetName: tx.assetName,
  });
}

/**
 * Strip the trailing F&O suffix from a contract-note `assetName` to get the
 * bare underlying. Examples:
 *   "NIFTY24N28CE24500" → "NIFTY"
 *   "RELIANCE24N28FUT"  → "RELIANCE"
 *   "BANKNIFTY24DEC52000PE" → "BANKNIFTY"
 * Returns null when the pattern doesn't match — the caller then falls back
 * to whatever string was passed in.
 */
export function extractUnderlyingFromAssetName(s: string | null | undefined): string | null {
  if (!s) return null;
  const u = s.toUpperCase();
  // Monthly future: <UND><YY><MMM>FUT
  const fut = u.match(/^([A-Z][A-Z0-9&\-]+?)\d{2}[A-Z]{3}FUT$/);
  if (fut?.[1]) return fut[1];
  // Monthly option: <UND><YY><MMM><STRIKE>(CE|PE)
  const optMo = u.match(/^([A-Z][A-Z0-9&\-]+?)\d{2}[A-Z]{3}\d+(?:\.\d+)?(CE|PE)$/);
  if (optMo?.[1]) return optMo[1];
  // Weekly option: <UND><YY><M-letter><DD><STRIKE>(CE|PE)
  const optWk = u.match(/^([A-Z][A-Z0-9&\-]+?)\d{2}[1-9OND]\d{2}\d+(?:\.\d+)?(CE|PE)$/);
  if (optWk?.[1]) return optWk[1];
  // Weekly with embedded month-letter mid-symbol: NIFTY26N28CE24500
  const optWkAlt = u.match(/^([A-Z][A-Z0-9&\-]+?)\d{2}[1-9OND]\d{2}(CE|PE)\d+(?:\.\d+)?$/);
  if (optWkAlt?.[1]) return optWkAlt[1];
  return null;
}
