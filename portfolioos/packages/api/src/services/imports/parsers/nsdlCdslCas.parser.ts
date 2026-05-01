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
    let usedPassword: string | null = null;
    try {
      const r = await readPdfText(ctx.filePath, passwords);
      text = r.text;
      usedPassword = r.usedPassword;
    } catch (err) {
      if (isPdfPasswordError(err)) {
        return {
          broker: 'Depository CAS',
          transactions: [],
          warnings: [
            passwords.length === 0
              ? 'Depository PDF is password-protected. Set your PAN in Settings — NSDL/CDSL statements are typically encrypted with your PAN.'
              : 'Depository PDF is password-protected and your saved PAN/DOB candidates did not unlock it. Some CDSL statements use BO-ID. Decrypt manually and re-upload.',
          ],
        };
      }
      throw err;
    }

    logger.info(
      { fileName: ctx.fileName, decrypted: !!usedPassword, textLen: text.length },
      '[nsdl-cdsl-cas] PDF text extracted',
    );

    const { transactions, warnings, depository, isTxnOnly } = parseNsdlCdslText(text);

    // If parser already concluded the file is legitimately empty (no
    // holdings, no activity), it returns warnings=[]. Don't add a fake
    // "couldn't recognize" warning that would flip status to FAILED.
    // Only surface the "unsupported layout" hint when txns=0 AND the parser
    // emitted at least one warning of its own (real ambiguity).
    const adjustedWarnings =
      transactions.length === 0 && text.length > 100 && warnings.length > 0
        ? [
            `PDF decrypted${usedPassword ? ' (using your saved PAN)' : ''} but parser couldn't recognize any transactions or holdings in this layout. The file may use an unsupported variant. Please share the file with support so we can extend the parser.`,
            ...warnings.filter((w) => !w.includes('password-protected')),
          ]
        : warnings;

    if (transactions.length === 0) {
      logger.warn(
        { fileName: ctx.fileName, depository, isTxnOnly, textLen: text.length },
        '[nsdl-cdsl-cas] nothing parsed',
      );
    }

    return {
      broker: depository ? `${depository} CAS` : 'Depository CAS',
      adapter: 'cas.depository.nsdl_cdsl',
      adapterVer: '1',
      transactions,
      warnings: adjustedWarnings,
    };
  },
};

/**
 * Pure text-parsing entry point — used by the PDF path after text extraction
 * and by the golden-fixture test suite (§5.1 task 9). The text-dependent logic
 * lives here; file I/O + password handling stay on the parser's `parse()`.
 */
export function parseNsdlCdslText(text: string): {
  transactions: ParsedTransaction[];
  warnings: string[];
  depository: 'NSDL' | 'CDSL' | null;
  isTxnOnly: boolean;
} {
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
      const beforeIsin = line.slice(0, isinMatch.index ?? 0).trim();
      if (beforeIsin && beforeIsin.length > 2 && beforeIsin.length < 120) {
        currentName = beforeIsin.replace(/\s{2,}/g, ' ');
      }
      if ((!currentName || /^\s*$/.test(currentName)) && i + 1 < lines.length) {
        const nxt = lines[i + 1]!.trim();
        if (nxt && !parseDate(nxt) && !ISIN_RE.test(nxt) && nxt.length < 120) {
          currentName = nxt;
        }
      }
    }

    const date = parseDate(line);
    if (!date) continue;

    const type = classifyTxType(line);
    if (!type) continue;

    const rowIsin = line.match(ISIN_RE)?.[1] ?? currentIsin;
    if (!rowIsin) continue;

    // Strip the date substring from the line before extracting numeric tokens
    // so the day/month/year digits can never be mistaken for quantity or price.
    // Previously we stripped the first 3 numeric tokens post-hoc, but that
    // also ate small-integer quantities (e.g. `20` shares) when the date had
    // three numeric components. Dropping the matched date text sidesteps
    // both the dash-as-minus-sign issue and the 1-2 digit qty collision.
    const dateStripped = line
      .replace(DATE_RE_ISO, '')
      .replace(DATE_RE_DASH, '')
      .replace(DATE_RE_SLASH, '');

    const numTokens = Array.from(
      dateStripped.matchAll(/(?<![A-Za-z0-9])-?[\d,]+(?:\.\d{1,6})?/g),
    )
      .map((m) => ({ raw: m[0], v: asDecimal(m[0]) }))
      .filter((t) => !t.v.isZero());

    if (numTokens.length === 0) continue;

    // Quantity is the first remaining number (may be integer for whole-share
    // trades or fractional for splits/bonuses).
    const qtyD = numTokens[0]!.v.abs();
    if (qtyD.isZero()) continue;

    // Price is the last decimal-bearing number (depository statements print
    // market rate as the rightmost column; it may be absent).
    const priceCand = [...numTokens].reverse().find((t) => /\./.test(t.raw));
    const priceD = priceCand ? priceCand.v.abs() : new Decimal(0);
    if (priceD.isZero()) priceMissingCount++;

    let finalType = type;
    if (type === 'BUY' && numTokens[0]!.v.isNegative()) finalType = 'SELL';
    if (type === 'SELL' && numTokens[0]!.v.isNegative()) finalType = 'BUY';

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
  // holding as an OPENING_BALANCE dated to the snapshot date, with price=0 —
  // cost basis is unknown from the holdings table (the "Rate" column is
  // current market price, not purchase price), so users get a warning to
  // fix cost basis manually.
  const holdingsBefore = txs.length;
  // Match both "HOLDINGS AS ON 31-03-2026" (NSDL/Zerodha format) and
  // "HOLDING STATEMENT AS ON 31-03-2026" (CDSL eCAS format).
  const holdingsAsOnMatch = text.match(
    /holding(?:s|\s+statement)?\s+as\s+on[:\s]*([0-9]{1,2}[-/][A-Za-z]{3}[-/][0-9]{2,4}|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})/i,
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

      if (/holding(?:s|\s+statement)?\s+as\s+on/i.test(line)) {
        inHoldingsSection = true;
        continue;
      }
      if (!inHoldingsSection) continue;

      if (
        /^total[:\s]/i.test(line) ||
        /system\s+generated/i.test(line) ||
        /^messages?[:\s-]/i.test(line) ||
        /portfolio\s+value\s*[`₹\d]/i.test(line) ||
        /notes\s+to\s+cas/i.test(line) ||
        /for\s+any\s+queries/i.test(line)
      ) {
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
        if (buf.numbers.length >= 9) flushHolding();
      }
    }
    flushHolding();
  }

  const holdingsAdded = txs.length - holdingsBefore;

  // Detect legitimately empty statement: parser reached the holdings section
  // (or saw a "Closing balance: None" / "Total: 0.000" pattern) but found no
  // actual rows. This means the user had no positions / no activity in the
  // statement period — NOT a parser failure. Don't surface as a warning so
  // processImportJob marks the job COMPLETED rather than FAILED.
  const looksEmpty =
    txs.length === 0 &&
    (
      /\btotal[:\s]+0\.0+\s+0\.0+/i.test(text) ||
      /closing\s+balance[:\s]+none/i.test(text) ||
      (holdingsDate !== null && holdingsAdded === 0) ||
      // Empty CDSL summary
      /no\s+(?:demat\s+account|mf\s+folios)\s+for\s+this\s+pan/i.test(text)
    );

  if (looksEmpty) {
    // Empty period — no warning, no error.
  } else if (txs.length === 0) {
    warnings.push(
      `No transactions or holdings detected in ${depository ?? 'depository'} statement — if the PDF is password-protected, remove the password and re-upload. If it is a scanned image, depository statements are not yet OCR-supported.`,
    );
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

  return { transactions: txs, warnings, depository, isTxnOnly };
}
