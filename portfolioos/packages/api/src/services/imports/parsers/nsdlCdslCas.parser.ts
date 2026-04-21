import { Decimal } from '@portfolioos/shared';
import type { Parser, ParserResult, ParsedTransaction } from './types.js';
import { logger } from '../../../lib/logger.js';
import { readPdfText, getUserPdfPasswords, isPdfPasswordError } from '../../../lib/pdf.js';

/**
 * NSDL / CDSL depository CAS & monthly transaction statement parser.
 *
 * Supports:
 *  - NSDL "Consolidated Account Statement"
 *  - CDSL "Consolidated Account Statement"
 *  - NSDL / CDSL monthly transaction statements (files named YYYYMM_<client-id>_TXN.pdf)
 *
 * Both depositories print transactions with an ISIN on the same line (or
 * immediately adjacent lines) plus a date in DD-MMM-YYYY or DD/MM/YYYY form,
 * a quantity, and a transaction-type keyword (Purchase/Sale/Credit/Debit/IPO/Bonus/...).
 *
 * The depository statement does not always print per-trade price, so when
 * price is missing we set it to 0 and flag a warning — the user can refine
 * prices via contract notes later, or use the CAS purely for holdings
 * reconciliation.
 */

const ISIN_RE = /\b(IN[EF][0-9A-Z]{9})\b/;
const DATE_RE_DASH = /\b(\d{1,2})-([A-Za-z]{3})-(\d{2,4})\b/;
const DATE_RE_SLASH = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;
const DATE_RE_ISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;

function normYear(y: string): string {
  if (y.length === 4) return y;
  const n = Number(y);
  return (n >= 70 ? 1900 + n : 2000 + n).toString();
}

function monthNumFromName(mo: string): string | null {
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  return months[mo.toLowerCase()] ?? null;
}

function parseDate(line: string): string | null {
  const iso = line.match(DATE_RE_ISO);
  if (iso) {
    const mo = iso[2]!.padStart(2, '0');
    const dd = iso[3]!.padStart(2, '0');
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
      return `${iso[1]}-${mo}-${dd}`;
    }
  }
  const a = line.match(DATE_RE_DASH);
  if (a) {
    const mo = monthNumFromName(a[2]!);
    if (!mo) return null;
    return `${normYear(a[3]!)}-${mo}-${a[1]!.padStart(2, '0')}`;
  }
  const b = line.match(DATE_RE_SLASH);
  if (b) {
    const mo = b[2]!.padStart(2, '0');
    if (Number(mo) < 1 || Number(mo) > 12) return null;
    return `${normYear(b[3]!)}-${mo}-${b[1]!.padStart(2, '0')}`;
  }
  return null;
}

// Preserve exact decimal representation from PDF text (§3.2). Returns a
// Decimal so downstream sign/magnitude checks run in arbitrary precision.
function asDecimal(s: string): Decimal {
  const cleaned = s.replace(/[,₹\s]/g, '').replace(/\((.+)\)/, '-$1');
  if (!cleaned || cleaned === '-') return new Decimal(0);
  try {
    const d = new Decimal(cleaned);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

type TxType = 'BUY' | 'SELL' | 'BONUS' | 'OPENING_BALANCE' | 'WITHDRAWAL' | null;

function classifyTxType(line: string): TxType {
  const u = line.toLowerCase();
  // Specific first
  if (u.includes('bonus')) return 'BONUS';
  // IPO allotment — treat as BUY (cost basis = issue price, often missing in CAS)
  if (u.includes('ipo') || u.includes('allotment')) return 'BUY';
  // Off-market / inter-depository transfers
  if (u.includes('off-market') || u.includes('off market') || u.includes('inter-depository')) {
    if (u.includes('out') || u.includes('debit')) return 'WITHDRAWAL';
    return 'OPENING_BALANCE';
  }
  // Purchase/sale via market
  if (/\bpur(chase)?\b/.test(u) || /\bpur[-\s]?nse\b/.test(u) || /\bpur[-\s]?bse\b/.test(u)) return 'BUY';
  if (/\b(sale|sell|sld)\b/.test(u) || /\bsal[-\s]?nse\b/.test(u) || /\bsal[-\s]?bse\b/.test(u)) return 'SELL';
  // Credit/Debit fallbacks (NSDL txn statement uses these)
  if (/\bcredit\b/.test(u)) return 'BUY';
  if (/\bdebit\b/.test(u)) return 'SELL';
  return null;
}

function detectFormat(text: string): { depository: 'NSDL' | 'CDSL' | null; isTxnOnly: boolean } {
  const u = text.toUpperCase();
  const hasNsdl = u.includes('NSDL') || u.includes('NATIONAL SECURITIES DEPOSITORY');
  const hasCdsl = u.includes('CDSL') || u.includes('CENTRAL DEPOSITORY SERVICES');
  const isTxnOnly =
    /TRANSACTION STATEMENT/i.test(text) &&
    !/CONSOLIDATED ACCOUNT STATEMENT/i.test(text);
  const dep = hasNsdl && !hasCdsl ? 'NSDL' : hasCdsl && !hasNsdl ? 'CDSL' : hasNsdl ? 'NSDL' : hasCdsl ? 'CDSL' : null;
  return { depository: dep, isTxnOnly };
}

export const nsdlCdslCasParser: Parser = {
  name: 'nsdl-cdsl-cas',

  async canHandle(ctx, sample) {
    if (!ctx.fileName.toLowerCase().endsWith('.pdf')) return false;
    const text = typeof sample === 'string' ? sample : '';
    if (!text) return false;
    const u = text.toUpperCase();
    const fn = ctx.fileName.toLowerCase();

    // Filename hints: broker/DP transaction+holding statements
    const filenameHint =
      /transaction[-_\s]?with[-_\s]?holding/.test(fn) ||
      /transaction[-_\s]?cum[-_\s]?holding/.test(fn) ||
      /_txn\.pdf$/.test(fn) ||
      /txn[-_\s]?statement/.test(fn);

    const isDepository =
      u.includes('NSDL') ||
      u.includes('CDSL') ||
      u.includes('NATIONAL SECURITIES DEPOSITORY') ||
      u.includes('CENTRAL DEPOSITORY SERVICES') ||
      u.includes('DP ID') ||
      u.includes('CLIENT ID') ||
      u.includes('BO ID') ||
      u.includes('BENEFICIARY OWNER') ||
      u.includes('DEMAT ACCOUNT') ||
      /HOLDING\s+STATEMENT/.test(u) ||
      /TRANSACTION\s+STATEMENT/.test(u);
    const isMfOnlyCas =
      (u.includes('CAMS') || u.includes('KFINTECH') || u.includes('KARVY')) &&
      !u.includes('NSDL') &&
      !u.includes('CDSL') &&
      !u.includes('DP ID');

    return (isDepository || filenameHint) && !isMfOnlyCas;
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
          broker: 'Depository CAS',
          transactions: [],
          warnings: [
            passwords.length === 0
              ? 'Depository PDF is password-protected. Set your PAN in Settings — NSDL/CDSL statements are typically encrypted with your PAN.'
              : 'Depository PDF is password-protected and your saved PAN did not unlock it. Some CDSL statements use BO-ID or DOB; decrypt manually and re-upload.',
          ],
        };
      }
      throw err;
    }
    const { depository, isTxnOnly } = detectFormat(text);
    const lines = text.split(/\r?\n/);

    const txs: ParsedTransaction[] = [];
    const warnings: string[] = [];

    // Walk lines, maintaining the "current ISIN / security name" as we go.
    // Depository PDFs group transactions under their security block.
    let currentIsin: string | null = null;
    let currentName: string | null = null;
    let priceMissingCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line) continue;

      // Update current ISIN / security context whenever we see an ISIN
      const isinMatch = line.match(ISIN_RE);
      if (isinMatch) {
        currentIsin = isinMatch[1]!;
        // Heuristic: company name typically appears before the ISIN on the same line
        const beforeIsin = line.slice(0, isinMatch.index ?? 0).trim();
        if (beforeIsin && beforeIsin.length > 2 && beforeIsin.length < 120) {
          currentName = beforeIsin.replace(/\s{2,}/g, ' ');
        }
        // Heuristic #2: sometimes next line is the company name
        if ((!currentName || /^\s*$/.test(currentName)) && i + 1 < lines.length) {
          const nxt = lines[i + 1]!.trim();
          if (nxt && !parseDate(nxt) && !ISIN_RE.test(nxt) && nxt.length < 120) {
            currentName = nxt;
          }
        }
      }

      // Try to parse a transaction row: needs a date and a classifiable type
      const date = parseDate(line);
      if (!date) continue;

      const type = classifyTxType(line);
      if (!type) continue;

      // An ISIN may appear on the same row — prefer it over current context
      const rowIsin = line.match(ISIN_RE)?.[1] ?? currentIsin;
      if (!rowIsin) continue;

      // Extract numbers. Quantity is typically the first "plain integer or 2-dp"
      // number that isn't part of the date. Price (market rate) is typically
      // the last 2-dp decimal on the row; may be absent.
      const numTokens = Array.from(line.matchAll(/-?[\d,]+(?:\.\d{1,6})?/g))
        .map((m) => ({ raw: m[0], v: asDecimal(m[0]) }))
        // Filter out calendar numbers from the date portion: anything that's
        // part of DD-MMM-YYYY or DD/MM/YYYY gets noisy. We prune after-the-fact
        // by removing up to 3 leading tokens that look like date components.
        .filter((t) => !t.v.isZero());

      // Strip date-component tokens from the head
      const candidates = numTokens.slice();
      const dateLike = /^(\d{1,2}|\d{4})$/;
      let stripped = 0;
      while (candidates.length && stripped < 3 && dateLike.test(candidates[0]!.raw)) {
        candidates.shift();
        stripped++;
      }

      if (candidates.length === 0) continue;

      // Quantity: first remaining number (often integer, but fractional units exist for bonus/split)
      const qtyD = candidates[0]!.v.abs();
      if (qtyD.isZero()) continue;

      // Price: last 2-dp number that's clearly a price (> qty in magnitude
      // isn't reliable; use presence of decimal as signal)
      const priceCand = [...candidates].reverse().find((t) => /\./.test(t.raw));
      const priceD = priceCand ? priceCand.v.abs() : new Decimal(0);
      if (priceD.isZero()) priceMissingCount++;

      // Direction sign: flip type if explicit sign on qty
      let finalType = type;
      if (type === 'BUY' && candidates[0]!.v.isNegative()) finalType = 'SELL';
      if (type === 'SELL' && candidates[0]!.v.isNegative()) finalType = 'BUY';

      txs.push({
        assetClass: 'EQUITY',
        transactionType: finalType,
        isin: rowIsin,
        stockName: currentName ?? undefined,
        assetName: currentName ?? undefined,
        tradeDate: date,
        quantity: qtyD.toString(),
        price: priceD.toString(),
        broker: depository ? `${depository} CAS` : 'Depository CAS',
        narration: line.slice(0, 200),
      });
    }

    // ── Holdings snapshot ────────────────────────────────────────────────────
    // Many depository / DP statements (e.g. Zerodha "Transaction with Holding")
    // include a holdings table after the transaction section. We import each
    // holding as a TRANSFER_IN dated to the snapshot date, with price=0 — this
    // surfaces long-held positions even when the period had no trades. Cost
    // basis is unknown from the holdings table (the "Rate" column is current
    // market price, not purchase price), so users get a clear warning to fix
    // cost basis manually if they want accurate P&L.
    const holdingsBefore = txs.length;
    const holdingsAsOnMatch = text.match(
      /holdings?\s+as\s+on[:\s]*([0-9]{1,2}[-/][A-Za-z]{3}[-/][0-9]{2,4}|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})/i,
    );
    const holdingsDate = holdingsAsOnMatch ? parseDate(holdingsAsOnMatch[1]!) : null;

    if (holdingsDate) {
      type HoldingBuf = { isin: string; namePieces: string[]; numbers: Decimal[] };
      let buf: HoldingBuf | null = null;
      let inHoldingsSection = false;

      const flushHolding = () => {
        if (!buf) return;
        const qty = buf.numbers[0] ?? new Decimal(0);
        if (qty.greaterThan(0)) {
          const name = buf.namePieces
            .join(' ')
            .replace(/\s+/g, ' ')
            .replace(/\s*-\s*EQ\b/i, '')
            .trim();
          txs.push({
            assetClass: 'EQUITY',
            transactionType: 'OPENING_BALANCE',
            isin: buf.isin,
            stockName: name || undefined,
            assetName: name || undefined,
            tradeDate: holdingsDate,
            quantity: qty.abs().toString(),
            price: '0',
            broker: depository ? `${depository} CAS` : 'Depository CAS',
            narration: `Opening holding from ${depository ?? 'depository'} statement (cost basis unknown)`,
          });
        }
        buf = null;
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (!line) continue;

        if (/holdings?\s+as\s+on/i.test(line)) {
          inHoldingsSection = true;
          continue;
        }
        if (!inHoldingsSection) continue;

        // End markers
        if (/^total[:\s]/i.test(line) || /system\s+generated/i.test(line) || /^messages?[:\s-]/i.test(line)) {
          flushHolding();
          inHoldingsSection = false;
          continue;
        }

        const isinMatch = line.match(ISIN_RE);
        if (isinMatch) {
          flushHolding();
          buf = { isin: isinMatch[1]!, namePieces: [], numbers: [] };
          const before = line.slice(0, isinMatch.index ?? 0).trim();
          const after = line.slice((isinMatch.index ?? 0) + isinMatch[0].length).trim();
          if (before && before.length < 80) buf.namePieces.push(before);
          for (const t of after.split(/\s+/).filter(Boolean)) {
            if (/^-?[\d,]+(?:\.\d+)?$/.test(t)) {
              buf.numbers.push(asDecimal(t));
            } else if (buf.numbers.length === 0) {
              buf.namePieces.push(t);
            }
          }
          continue;
        }

        if (buf) {
          for (const t of line.split(/\s+/).filter(Boolean)) {
            if (/^-?[\d,]+(?:\.\d+)?$/.test(t)) {
              buf.numbers.push(asDecimal(t));
            } else if (buf.numbers.length === 0) {
              buf.namePieces.push(t);
            }
          }
          // Holdings table typically has 8–10 numeric columns; flush when we
          // have enough or when the next ISIN appears (handled above).
          if (buf.numbers.length >= 9) flushHolding();
        }
      }
      flushHolding();
    }

    const holdingsAdded = txs.length - holdingsBefore;

    if (txs.length === 0) {
      warnings.push(
        `No transactions or holdings detected in ${depository ?? 'depository'} statement — if the PDF is password-protected, remove the password and re-upload. If it is a scanned image, depository statements are not yet OCR-supported.`,
      );
      logger.warn({ fileName: ctx.fileName, depository, isTxnOnly }, '[nsdl-cdsl-cas] nothing parsed');
    } else {
      if (priceMissingCount > 0) {
        warnings.push(
          `Parsed ${txs.length - holdingsAdded} transactions from ${depository ?? 'depository'} statement; ${priceMissingCount} rows had no market rate printed (depository statements often omit per-trade price). Import contract notes to fill in trade prices.`,
        );
      }
      if (holdingsAdded > 0) {
        warnings.push(
          `Imported ${holdingsAdded} holding${holdingsAdded === 1 ? '' : 's'} as opening positions dated ${holdingsDate}. Cost basis is set to 0 because the depository statement only prints current market rate, not purchase price — edit each transaction's price on the Transactions page to match your actual cost for accurate P&L.`,
        );
      }
    }

    return {
      broker: depository ? `${depository} CAS` : 'Depository CAS',
      transactions: txs,
      warnings,
    };
  },
};
