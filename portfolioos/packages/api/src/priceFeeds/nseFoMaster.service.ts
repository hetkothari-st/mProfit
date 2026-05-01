/**
 * NSE F&O instrument master sync.
 *
 * Source: https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv
 *   - Lot sizes per underlying per expiry month.
 *   - Updated weekly (effective from each Friday's close for the next week).
 *
 * Plus: https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv (existing)
 *   for ISIN cross-reference.
 *
 * The master is what makes the assetKey scheme deterministic — every
 * import, manual entry and price-feed lookup resolves through here.
 */

import { request } from 'undici';
import { Decimal } from 'decimal.js';
import type { FoInstrument, FoInstrumentType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

const FO_MKTLOTS_URL = 'https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv';

interface MktLotRow {
  underlying: string;
  expiryMonth: string; // "JUL-2026"
  lotSize: number;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchCsv(url: string): Promise<string> {
  const res = await request(url, {
    method: 'GET',
    headers: { 'user-agent': BROWSER_UA, accept: 'text/csv, */*' },
    bodyTimeout: 60_000,
    headersTimeout: 20_000,
  });
  if (res.statusCode !== 200) {
    await res.body.dump();
    throw new Error(`NSE fo_mktlots fetch failed: ${res.statusCode}`);
  }
  return await res.body.text();
}

function parseMktLotsCsv(csv: string): MktLotRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',').map((s) => s.trim().toUpperCase());
  const symIdx = header.findIndex((h) => h.includes('SYMBOL') || h.includes('UNDERLYING'));
  // Each remaining column is a future expiry month with a lot-size value.
  // Layout (current as of 2026):
  //   SR.NO, UNDERLYING, SYMBOL, JUL 2026, AUG 2026, SEP 2026
  // The first non-symbol header that looks like a month gives us the
  // current near-month lot size, which is what callers need most.
  const rows: MktLotRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i]!.split(',').map((s) => s.trim());
    if (cols.length < 4) continue;
    const symbol = cols[symIdx]?.replace(/^"|"$/g, '');
    if (!symbol) continue;
    for (let c = 0; c < cols.length; c += 1) {
      const h = header[c];
      if (!h) continue;
      const m = h.match(/^([A-Z]{3})[\s-]?(\d{2,4})$/);
      if (!m) continue;
      const lot = Number((cols[c] ?? '').replace(/[^\d]/g, ''));
      if (!Number.isFinite(lot) || lot <= 0) continue;
      rows.push({
        underlying: symbol.toUpperCase(),
        expiryMonth: `${m[1]}-${m[2]!.length === 2 ? `20${m[2]}` : m[2]}`,
        lotSize: lot,
      });
    }
  }
  return rows;
}

/**
 * Resolve last Thursday of a month (Indian F&O expiry convention for
 * monthly contracts). Indices have weekly expiries on Thursdays, but the
 * monthly lot-size table only carries one expiry-per-month per underlying.
 */
function lastThursdayOfMonth(year: number, monthIndex0: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  const dow = lastDay.getUTCDay(); // 0=Sun, 4=Thu
  const offset = (dow - 4 + 7) % 7;
  return new Date(Date.UTC(year, monthIndex0 + 1, 0 - offset));
}

const MONTH_IDX: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

export async function loadNseFoMaster(): Promise<{ instruments: number; rows: number }> {
  const csv = await fetchCsv(FO_MKTLOTS_URL);
  const rows = parseMktLotsCsv(csv);
  if (rows.length === 0) {
    logger.warn('[nseFoMaster] empty parse — header layout may have changed');
    return { instruments: 0, rows: 0 };
  }

  // Promote each row → FUTURES instrument for the underlying+expiry.
  // (Options strikes are populated lazily by the option-chain service when
  // first queried — there's no master CSV that lists every active strike,
  // so we accept-and-resolve as we see them.)
  let upserted = 0;
  for (const r of rows) {
    const [m, yStr] = r.expiryMonth.split('-');
    if (!m || !yStr) continue;
    const monthIdx = MONTH_IDX[m];
    if (monthIdx === undefined) continue;
    const expiry = lastThursdayOfMonth(Number(yStr), monthIdx);
    const tradingSymbol = buildFutTradingSymbol(r.underlying, expiry);

    await prisma.foInstrument.upsert({
      where: { tradingSymbol },
      create: {
        symbol: r.underlying,
        underlying: r.underlying,
        instrumentType: 'FUTURES',
        strikePrice: null,
        expiryDate: expiry,
        lotSize: r.lotSize,
        tickSize: '0.05',
        contractMultiplier: '1',
        settlementType: 'CASH',
        tradingSymbol,
        isActive: true,
        exchange: 'NFO',
        lastUpdated: new Date(),
      },
      update: {
        lotSize: r.lotSize,
        expiryDate: expiry,
        isActive: true,
        lastUpdated: new Date(),
      },
    });
    upserted += 1;
  }

  return { instruments: upserted, rows: rows.length };
}

/**
 * "NIFTY" + last-thursday-of-NOV-2026 → "NIFTY26NOVFUT"
 * (the standard NSE 2-digit-year + 3-letter-month FUT form). Used as a
 * stable unique key in `FoInstrument.tradingSymbol`.
 */
export function buildFutTradingSymbol(underlying: string, expiry: Date): string {
  const yy = String(expiry.getUTCFullYear()).slice(2);
  const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][expiry.getUTCMonth()]!;
  return `${underlying.toUpperCase()}${yy}${mon}FUT`;
}

export function buildOptionTradingSymbol(
  underlying: string,
  expiry: Date,
  type: 'CE' | 'PE',
  strike: number | string,
): string {
  const yy = String(expiry.getUTCFullYear()).slice(2);
  const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][expiry.getUTCMonth()]!;
  const strikeStr = String(strike).split('.')[0]!;
  return `${underlying.toUpperCase()}${yy}${mon}${strikeStr}${type}`;
}

/**
 * Resolve a `FoInstrument` row from a Transaction's assetKey. Returns null
 * when the instrument hasn't been seen by master sync — caller can create
 * a minimal row from contract-note metadata instead of failing.
 */
export async function resolveFoInstrumentByAssetKey(
  assetKey: string,
): Promise<FoInstrument | null> {
  if (!assetKey.startsWith('fno:')) return null;
  const parts = assetKey.split(':');
  if (parts.length < 5) return null;
  const [, underlying, type, strikeStr, expiryStr] = parts;
  const instrumentType: FoInstrumentType =
    type === 'FUT' ? 'FUTURES' : type === 'CE' ? 'CALL' : 'PUT';
  const expiryDate = new Date(`${expiryStr}T00:00:00.000Z`);
  const strikePrice =
    type === 'FUT' ? null : new Decimal(strikeStr ?? '0').toString();

  return prisma.foInstrument.findFirst({
    where: {
      underlying: underlying ?? '',
      instrumentType,
      strikePrice,
      expiryDate,
    },
  });
}

/**
 * Latest EOD price for an F&O contract — single canonical lookup the
 * router and DerivativePosition.service both call. Returns the most
 * recent FoContractPrice row (closePrice + Greeks if cached).
 */
export async function getLatestFoContractPrice(
  assetKey: string,
): Promise<{
  closePrice: string;
  settlementPrice: string;
  tradeDate: Date;
  delta: string | null;
  gamma: string | null;
  theta: string | null;
  vega: string | null;
  impliedVolatility: string | null;
} | null> {
  const inst = await resolveFoInstrumentByAssetKey(assetKey);
  if (!inst) return null;
  const price = await prisma.foContractPrice.findFirst({
    where: { instrumentId: inst.id },
    orderBy: { tradeDate: 'desc' },
  });
  if (!price) return null;
  return {
    closePrice: price.closePrice.toString(),
    settlementPrice: price.settlementPrice.toString(),
    tradeDate: price.tradeDate,
    delta: price.delta?.toString() ?? null,
    gamma: price.gamma?.toString() ?? null,
    theta: price.theta?.toString() ?? null,
    vega: price.vega?.toString() ?? null,
    impliedVolatility: price.impliedVolatility?.toString() ?? null,
  };
}

/**
 * Best-effort minimal-row creator for instruments that show up in user
 * imports before our weekly master sync sees them. Caller passes whatever
 * fields the import has; we infer the rest with safe defaults.
 */
export async function ensureFoInstrument(input: {
  underlying: string;
  instrumentType: FoInstrumentType;
  strikePrice?: string | number | null;
  expiryDate: Date;
  lotSize: number;
  tickSize?: string;
  exchange?: 'NFO' | 'BFO';
}): Promise<FoInstrument> {
  const tradingSymbol =
    input.instrumentType === 'FUTURES'
      ? buildFutTradingSymbol(input.underlying, input.expiryDate)
      : buildOptionTradingSymbol(
          input.underlying,
          input.expiryDate,
          input.instrumentType === 'CALL' ? 'CE' : 'PE',
          input.strikePrice ?? 0,
        );
  return prisma.foInstrument.upsert({
    where: { tradingSymbol },
    create: {
      symbol: input.underlying.toUpperCase(),
      underlying: input.underlying.toUpperCase(),
      instrumentType: input.instrumentType,
      strikePrice:
        input.strikePrice !== undefined && input.strikePrice !== null
          ? new Decimal(input.strikePrice.toString()).toString()
          : null,
      expiryDate: input.expiryDate,
      lotSize: input.lotSize,
      tickSize: input.tickSize ?? '0.05',
      contractMultiplier: '1',
      settlementType: 'CASH',
      tradingSymbol,
      isActive: true,
      exchange: input.exchange ?? 'NFO',
      lastUpdated: new Date(),
    },
    update: {
      lotSize: input.lotSize,
      lastUpdated: new Date(),
      isActive: true,
    },
  });
}
