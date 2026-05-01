import type { FoInstrumentType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/**
 * Parse Kite/Upstox/Angel-style F&O tradingsymbol into structured fields.
 *
 * NSE convention examples:
 *   "NIFTY26NOV24500CE" — index option, 28-Nov-2026 (last Thu), strike 24500, CE
 *   "NIFTY26N1324500CE" — weekly: <yy><M><DD>: 13-Nov-2026, NIFTY 24500 CE
 *   "NIFTY26NOVFUT"     — monthly future
 *   "RELIANCE26NOVFUT"  — stock future
 *   "RELIANCE26NOV1300CE" — stock option
 */
const FUT_RE = /^([A-Z][A-Z0-9&\-]+?)(\d{2})([A-Z]{3})FUT$/;
const OPT_MONTHLY_RE = /^([A-Z][A-Z0-9&\-]+?)(\d{2})([A-Z]{3})(\d+(?:\.\d+)?)(CE|PE)$/;
// Weekly: YY + month-letter (1-9, O, N, D) + DD
const OPT_WEEKLY_RE = /^([A-Z][A-Z0-9&\-]+?)(\d{2})([1-9OND])(\d{2})(\d+(?:\.\d+)?)(CE|PE)$/;

const MONTH_IDX: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};
const WEEKLY_MONTH_LETTER: Record<string, number> = {
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5,
  '7': 6, '8': 7, '9': 8, 'O': 9, 'N': 10, 'D': 11,
};

function lastThursday(year: number, monthIdx0: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIdx0 + 1, 0));
  const dow = lastDay.getUTCDay();
  const offset = (dow - 4 + 7) % 7;
  return new Date(Date.UTC(year, monthIdx0 + 1, 0 - offset));
}

export interface ParsedFoSymbol {
  underlying: string;
  instrumentType: FoInstrumentType;
  strikePrice: string | null;
  expiryDate: string; // YYYY-MM-DD
  lotSize?: number;   // resolved later via FoInstrument lookup
}

export function parseKiteTradingSymbol(sym: string): ParsedFoSymbol | null {
  const s = sym.toUpperCase();

  const fut = s.match(FUT_RE);
  if (fut) {
    const yy = Number(fut[2]);
    const mon = MONTH_IDX[fut[3]!];
    if (mon === undefined) return null;
    const expiry = lastThursday(2000 + yy, mon);
    return {
      underlying: fut[1]!,
      instrumentType: 'FUTURES',
      strikePrice: null,
      expiryDate: expiry.toISOString().slice(0, 10),
    };
  }

  const optWk = s.match(OPT_WEEKLY_RE);
  if (optWk) {
    const yy = Number(optWk[2]);
    const monLetter = optWk[3]!;
    const dd = Number(optWk[4]);
    const monIdx = WEEKLY_MONTH_LETTER[monLetter];
    if (monIdx === undefined) return null;
    const expiry = new Date(Date.UTC(2000 + yy, monIdx, dd));
    return {
      underlying: optWk[1]!,
      instrumentType: optWk[6] === 'CE' ? 'CALL' : 'PUT',
      strikePrice: optWk[5]!,
      expiryDate: expiry.toISOString().slice(0, 10),
    };
  }

  const optMo = s.match(OPT_MONTHLY_RE);
  if (optMo) {
    const yy = Number(optMo[2]);
    const mon = MONTH_IDX[optMo[3]!];
    if (mon === undefined) return null;
    const expiry = lastThursday(2000 + yy, mon);
    return {
      underlying: optMo[1]!,
      instrumentType: optMo[5] === 'CE' ? 'CALL' : 'PUT',
      strikePrice: optMo[4]!,
      expiryDate: expiry.toISOString().slice(0, 10),
    };
  }

  return null;
}

/**
 * Resolve the lotSize for a parsed symbol from the FoInstrument master.
 * Falls back to 1 when not yet seen — callers can override via the
 * connector if they have it in the trade payload.
 */
export async function resolveLotSize(parsed: ParsedFoSymbol): Promise<number> {
  const inst = await prisma.foInstrument.findFirst({
    where: {
      underlying: parsed.underlying,
      instrumentType: parsed.instrumentType,
      strikePrice: parsed.strikePrice ?? undefined,
      expiryDate: new Date(`${parsed.expiryDate}T00:00:00.000Z`),
    },
  });
  if (inst) return inst.lotSize;
  // Fallback: most-recent active row for the same underlying.
  const fallback = await prisma.foInstrument.findFirst({
    where: { underlying: parsed.underlying, isActive: true },
    orderBy: { lastUpdated: 'desc' },
  });
  return fallback?.lotSize ?? 1;
}
