import { Decimal } from '@portfolioos/shared';
import type { Parser, ParserResult, ParsedTransaction } from './types.js';
import { logger } from '../../../lib/logger.js';
import { readPdfText, getUserPdfPasswords, isPdfPasswordError } from '../../../lib/pdf.js';

/**
 * Zerodha Digital Contract Note (PDF) parser.
 * Zerodha contract notes contain trades in a tabular section with columns:
 *   ISIN | Symbol | Series | Order No. | Trade No. | Time | Buy/Sell | Qty | Rate | Net Amount
 *
 * The PDF text comes out in a mostly-linear stream. We look for the trade
 * date near the top, and per-trade rows that start with an ISIN pattern.
 */

const ISIN_RE = /\b(IN[EF][0-9A-Z]{9})\b/;
const DATE_RE = /Trade Date[:\s]*([0-9]{1,2}[-/][A-Za-z]{3}[-/][0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})/i;

// F&O tradingsymbol patterns. Zerodha contract notes list F&O trades in a
// separate section labelled "Equity Futures and Options" / "F&O" with
// tradingsymbol as the leading identifier (no ISIN).
const FNO_FUT_RE = /^([A-Z][A-Z0-9&\-]+?)(\d{2})([A-Z]{3})FUT$/;
const FNO_OPT_MO_RE = /^([A-Z][A-Z0-9&\-]+?)(\d{2})([A-Z]{3})(\d+(?:\.\d+)?)(CE|PE)$/;
const FNO_OPT_WK_RE = /^([A-Z][A-Z0-9&\-]+?)(\d{2})([1-9OND])(\d{2})(\d+(?:\.\d+)?)(CE|PE)$/;
const MONTH_IDX: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};
const WK_MONTH: Record<string, number> = {
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5,
  '7': 6, '8': 7, '9': 8, 'O': 9, 'N': 10, 'D': 11,
};

function lastThursday(year: number, monthIdx0: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIdx0 + 1, 0));
  const dow = lastDay.getUTCDay();
  const offset = (dow - 4 + 7) % 7;
  return new Date(Date.UTC(year, monthIdx0 + 1, 0 - offset));
}

function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const monAlpha = s.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})$/);
  if (monAlpha) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const mo = months[monAlpha[2]!.toLowerCase()];
    if (mo) return `${monAlpha[3]}-${mo}-${monAlpha[1]!.padStart(2, '0')}`;
  }
  // DD/MM/YYYY or DD-MM-YYYY — Indian contract notes routinely use this form.
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const dd = dmy[1]!.padStart(2, '0');
    const mm = dmy[2]!.padStart(2, '0');
    if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
      return `${dmy[3]}-${mm}-${dd}`;
    }
  }
  return null;
}

// Preserve exact decimal representation from the PDF text (§3.2). Returns a
// Decimal-parseable string or '0' on malformed input.
function cleanNumString(s: string): string {
  const cleaned = s.replace(/[,\s₹]/g, '').replace(/\((.+)\)/, '-$1');
  if (!cleaned || cleaned === '-') return '0';
  try {
    const d = new Decimal(cleaned);
    return d.isFinite() ? cleaned : '0';
  } catch {
    return '0';
  }
}

export const zerodhaContractNoteParser: Parser = {
  name: 'zerodha-contract-note',

  async canHandle(ctx, sample) {
    if (!ctx.fileName.toLowerCase().endsWith('.pdf')) return false;
    const text = typeof sample === 'string' ? sample : '';
    if (!text) return false;
    const t = text.toUpperCase();
    const isContractNote =
      t.includes('CONTRACT NOTE') ||
      t.includes('CONTRACTNOTE') ||
      t.includes('CONFIRMATION OF TRADE');
    const isBrokerDoc =
      t.includes('ZERODHA') ||
      t.includes('TRADING MEMBER') ||
      t.includes('SEBI REGISTRATION');
    return isContractNote && isBrokerDoc;
  },

  async parse(ctx): Promise<ParserResult> {
    const passwords = await getUserPdfPasswords(ctx.userId);
    let text: string;
    try {
      const r = await readPdfText(ctx.filePath, passwords);
      text = r.text;
    } catch (err) {
      if (isPdfPasswordError(err)) {
        return {
          broker: 'Zerodha',
          transactions: [],
          warnings: [
            passwords.length === 0
              ? 'PDF is password-protected. Set your PAN in Settings — Zerodha contract notes are encrypted with your PAN.'
              : 'PDF is password-protected and your saved PAN did not unlock it. Check that Settings → PAN matches the PAN on your Zerodha account.',
          ],
        };
      }
      throw err;
    }

    const { transactions, warnings } = parseZerodhaContractNoteText(text);
    if (transactions.length === 0) {
      logger.warn({ fileName: ctx.fileName }, '[zerodha-pdf] no trades parsed');
    }

    return {
      broker: 'Zerodha',
      adapter: 'zerodha.contract_note',
      adapterVer: '1',
      transactions,
      warnings,
    };
  },
};

/**
 * Pure text-parsing entry point — the seam the DLQ pipeline (post-PDF-extract)
 * and the golden-fixture test suite (§5.1 task 9) both call. Isolating this
 * from the readPdfText/fs side-effects lets snapshots run against canned
 * text inputs without needing a real PDF checked into the repo.
 */
export function parseZerodhaContractNoteText(text: string): {
  transactions: ParsedTransaction[];
  warnings: string[];
} {
  const tradeDateMatch = text.match(DATE_RE);
  const tradeDate = tradeDateMatch ? toIsoDate(tradeDateMatch[1]!) : null;

  const txs: ParsedTransaction[] = [];
  const warnings: string[] = [];

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // F&O row: leading token matches FUT/CE/PE pattern. F&O sections in
    // Zerodha contract notes do NOT carry an ISIN — that's the discriminator.
    const parts = line.split(/\s+/);
    const fnoCandidate = parts[0];
    if (fnoCandidate && (FNO_FUT_RE.test(fnoCandidate) || FNO_OPT_MO_RE.test(fnoCandidate) || FNO_OPT_WK_RE.test(fnoCandidate))) {
      const fnoTx = tryParseFnoLine(line, tradeDate);
      if (fnoTx) {
        txs.push(fnoTx);
        continue;
      }
    }

    const isinMatch = line.match(ISIN_RE);
    if (!isinMatch) continue;

    const isinIdx = parts.findIndex((p) => ISIN_RE.test(p));
    if (isinIdx < 0) continue;

    const isin = parts[isinIdx]!;
    const symbol = parts[isinIdx + 1];
    const side = parts.find((p) => /^[BS]$/i.test(p) || /^BUY$/i.test(p) || /^SELL$/i.test(p));
    const numericStrs = parts.filter((p) => /^-?[\d,]+(?:\.\d+)?$/.test(p)).map(cleanNumString);
    if (!symbol || !side || numericStrs.length < 2) continue;

    const qty = numericStrs[numericStrs.length - 3] ?? numericStrs[numericStrs.length - 2];
    const rate = numericStrs[numericStrs.length - 2];

    if (!qty || !rate) continue;
    const qtyD = new Decimal(qty);
    const rateD = new Decimal(rate);
    if (qtyD.isZero()) continue;

    const isSell = /S/i.test(side);
    txs.push({
      assetClass: 'EQUITY',
      transactionType: isSell ? 'SELL' : 'BUY',
      symbol: symbol.toUpperCase(),
      isin,
      exchange: 'NSE',
      tradeDate: tradeDate ?? new Date().toISOString().slice(0, 10),
      quantity: qtyD.abs().toString(),
      price: rateD.abs().toString(),
      broker: 'Zerodha',
    });
  }

  if (txs.length === 0) {
    warnings.push('No trades detected in Zerodha PDF — file may be scanned image or unsupported format');
  }

  return { transactions: txs, warnings };
}

function tryParseFnoLine(line: string, tradeDate: string | null): ParsedTransaction | null {
  const parts = line.split(/\s+/);
  const sym = parts[0]!.toUpperCase();
  const side = parts.find((p) => /^[BS]$/i.test(p) || /^BUY$/i.test(p) || /^SELL$/i.test(p));
  const numericStrs = parts.filter((p) => /^-?[\d,]+(?:\.\d+)?$/.test(p)).map(cleanNumString);
  if (!side || numericStrs.length < 2) return null;

  let underlying: string | null = null;
  let instrumentType: 'FUTURES' | 'CALL' | 'PUT' | null = null;
  let strikePrice: string | null = null;
  let expiryDate: Date | null = null;

  const fut = sym.match(FNO_FUT_RE);
  const optMo = sym.match(FNO_OPT_MO_RE);
  const optWk = sym.match(FNO_OPT_WK_RE);
  if (fut) {
    underlying = fut[1]!;
    instrumentType = 'FUTURES';
    expiryDate = lastThursday(2000 + Number(fut[2]), MONTH_IDX[fut[3]!]!);
  } else if (optMo) {
    underlying = optMo[1]!;
    instrumentType = optMo[5] === 'CE' ? 'CALL' : 'PUT';
    strikePrice = optMo[4]!;
    expiryDate = lastThursday(2000 + Number(optMo[2]), MONTH_IDX[optMo[3]!]!);
  } else if (optWk) {
    underlying = optWk[1]!;
    instrumentType = optWk[6] === 'CE' ? 'CALL' : 'PUT';
    strikePrice = optWk[5]!;
    expiryDate = new Date(Date.UTC(2000 + Number(optWk[2]), WK_MONTH[optWk[3]!]!, Number(optWk[4])));
  }
  if (!underlying || !instrumentType || !expiryDate) return null;

  const qty = numericStrs[numericStrs.length - 3] ?? numericStrs[numericStrs.length - 2]!;
  const rate = numericStrs[numericStrs.length - 2]!;
  const qtyD = new Decimal(qty);
  const rateD = new Decimal(rate);
  if (qtyD.isZero()) return null;

  const isSell = /^S/i.test(side);
  return {
    assetClass: instrumentType === 'FUTURES' ? 'FUTURES' : 'OPTIONS',
    transactionType: isSell ? 'SELL' : 'BUY',
    symbol: underlying,
    assetName: sym,
    exchange: 'NFO',
    tradeDate: tradeDate ?? new Date().toISOString().slice(0, 10),
    quantity: qtyD.abs().toString(),
    price: rateD.abs().toString(),
    broker: 'Zerodha',
    strikePrice: strikePrice ?? undefined,
    expiryDate: expiryDate.toISOString().slice(0, 10),
    optionType: instrumentType === 'FUTURES' ? undefined : instrumentType,
  };
}
