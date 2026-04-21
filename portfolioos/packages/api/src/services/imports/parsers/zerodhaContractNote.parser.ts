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
const DATE_RE = /Trade Date[:\s]*([0-9]{1,2}[-/][A-Za-z]{3}[-/][0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i;

function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})$/);
  if (m) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const mo = months[m[2]!.toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1]!.padStart(2, '0')}`;
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

    const tradeDateMatch = text.match(DATE_RE);
    const tradeDate = tradeDateMatch ? toIsoDate(tradeDateMatch[1]!) : null;

    const txs: ParsedTransaction[] = [];
    const warnings: string[] = [];

    const lines = text.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const isinMatch = line.match(ISIN_RE);
      if (!isinMatch) continue;

      const parts = line.split(/\s+/);
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
      logger.warn({ fileName: ctx.fileName }, '[zerodha-pdf] no trades parsed');
    }

    return {
      broker: 'Zerodha',
      adapter: 'zerodha.contract_note',
      adapterVer: '1',
      transactions: txs,
      warnings,
    };
  },
};
