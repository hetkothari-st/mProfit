import type { Parser, ParserResult, ParsedTransaction } from './types.js';
import { logger } from '../../../lib/logger.js';
import { readPdfText, getUserPdfPasswords, isPdfPasswordError } from '../../../lib/pdf.js';

/**
 * CAS (Consolidated Account Statement) parser for CAMS and KFintech.
 * Both reports contain an opening folio header, then lines like:
 *   07-Jan-2024 Purchase 1,234.567 12.3456 15,234.45
 *   15-Feb-2024 Redemption -500.000 13.2134 6,606.70
 */

const ISIN_RE = /\b(IN[EF][0-9A-Z]{9})\b/;
const DATE_RE = /^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})/;
const FOLIO_RE = /Folio No[:\s]*([A-Z0-9/-]+)/i;
const AMC_RE = /^([A-Z][A-Za-z0-9 &.'-]{2,}(?:Mutual Fund|MF|Asset Management))/m;
const SCHEME_RE = /ISIN[:\s]*(IN[EF][0-9A-Z]{9})[\s\S]*?(?:Scheme|Advisor|Registrar)/i;

function toIso(d: string, mo: string, y: string): string | null {
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const m = months[mo.toLowerCase()];
  if (!m) return null;
  return `${y}-${m}-${d.padStart(2, '0')}`;
}

function asNum(s: string): number {
  const cleaned = s.replace(/[,₹\s]/g, '').replace(/\((.+)\)/, '-$1');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function detectType(txnLine: string): { type: 'BUY' | 'SELL' | 'SIP' | 'SWITCH_IN' | 'SWITCH_OUT' | 'DIVIDEND_REINVEST' | 'REDEMPTION' | null } {
  const u = txnLine.toLowerCase();
  if (u.includes('sip')) return { type: 'SIP' };
  if (u.includes('switch in') || u.includes('switch-in')) return { type: 'SWITCH_IN' };
  if (u.includes('switch out') || u.includes('switch-out')) return { type: 'SWITCH_OUT' };
  if (u.includes('reinvest')) return { type: 'DIVIDEND_REINVEST' };
  if (u.includes('redemption') || u.includes('redeem')) return { type: 'REDEMPTION' };
  if (u.includes('purchase') || u.includes('investment')) return { type: 'BUY' };
  if (u.includes('sale') || u.includes('sell')) return { type: 'SELL' };
  return { type: null };
}

export const mfCasParser: Parser = {
  name: 'mf-cas',

  async canHandle(ctx, sample) {
    if (!ctx.fileName.toLowerCase().endsWith('.pdf')) return false;
    const text = typeof sample === 'string' ? sample : '';
    if (!text) return false;
    const t = text.toUpperCase();
    // Scope to MF CAS only — depository CAS (NSDL/CDSL) has its own parser.
    const isMfCas =
      t.includes('CAMS') ||
      t.includes('KFINTECH') ||
      t.includes('KARVY') ||
      (t.includes('CONSOLIDATED ACCOUNT STATEMENT') &&
        (t.includes('MUTUAL FUND') || t.includes('AMC')) &&
        !t.includes('NSDL') &&
        !t.includes('CDSL'));
    return isMfCas;
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
          broker: 'CAMS/KFintech CAS',
          transactions: [],
          warnings: [
            passwords.length === 0
              ? 'CAS PDF is password-protected. Set your PAN in Settings — CAMS/KFintech CAS is encrypted with your PAN.'
              : 'CAS PDF is password-protected and your saved PAN did not unlock it. Some CAS files use PAN + DOB (DDMMYYYY); those are not yet supported — decrypt the PDF manually and re-upload.',
          ],
        };
      }
      throw err;
    }
    const lines = text.split(/\r?\n/);

    const currentScheme: {
      name: string;
      isin: string | null;
      folio: string | null;
      amc: string | null;
    } = { name: '', isin: null, folio: null, amc: null };

    const txs: ParsedTransaction[] = [];
    const warnings: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const folioMatch = line.match(FOLIO_RE);
      if (folioMatch) {
        currentScheme.folio = folioMatch[1]!.trim();
        continue;
      }

      const isinMatch = line.match(ISIN_RE);
      if (isinMatch && line.length < 200 && line.toLowerCase().includes('isin')) {
        currentScheme.isin = isinMatch[1]!;
        const nameBefore = line.split(/ISIN/i)[0]?.trim();
        if (nameBefore) currentScheme.name = nameBefore;
        continue;
      }

      // Try trade row: "DD-MMM-YYYY <desc> <qty> <nav> <amount>"
      const dateMatch = line.match(DATE_RE);
      if (!dateMatch) continue;

      const tradeDate = toIso(dateMatch[1]!, dateMatch[2]!, dateMatch[3]!);
      if (!tradeDate) continue;

      const rest = line.slice(dateMatch[0].length);
      const { type } = detectType(rest);
      if (!type) continue;

      const nums = Array.from(rest.matchAll(/-?[\d,]+\.\d{2,6}/g)).map((m) => asNum(m[0]));
      if (nums.length < 2) continue;

      // In CAS statements: units, NAV, amount appear in that order at the end
      const amount = nums[nums.length - 1]!;
      const nav = nums[nums.length - 2]!;
      const units = nums.length >= 3 ? nums[nums.length - 3]! : Math.abs(amount / (nav || 1));

      if (units === 0 || nav === 0) continue;

      txs.push({
        assetClass: 'MUTUAL_FUND',
        transactionType: type,
        schemeName: currentScheme.name || undefined,
        isin: currentScheme.isin ?? undefined,
        assetName: currentScheme.name || undefined,
        tradeDate,
        quantity: Math.abs(units),
        price: Math.abs(nav),
        narration: rest.trim().slice(0, 200),
      });
    }

    if (txs.length === 0) {
      warnings.push(
        'No MF transactions detected in CAS PDF — if your CAS is password-protected, remove the password and re-upload',
      );
      logger.warn({ fileName: ctx.fileName }, '[mf-cas] no trades parsed');
    }

    return { broker: 'CAMS/KFintech CAS', transactions: txs, warnings };
  },
};
