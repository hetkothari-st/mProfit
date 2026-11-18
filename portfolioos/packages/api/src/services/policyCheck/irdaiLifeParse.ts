/**
 * IRDAI Handbook Table 15 — individual death claims of life insurers, insurer-wise.
 *
 * One 20-column block per financial year, each metric as a (policies, benefit ₹ crore)
 * pair: [pending at start, intimated, total, paid, repudiated, rejected, unclaimed,
 * pending at end, …age break-up]. Row layout verified against the 2024-25 Handbook:
 * LIC 2021-22 paid 1,349,865 of 1,367,104 total = IRDAI's own printed ratio 0.98739.
 *
 * "Individual" death claims cover ALL individual life policies (term, endowment,
 * ULIP, …), not term alone — the report says so.
 */

import { Decimal } from '@everypaisa/shared';
import { cleanInsurerName, insurerKey, type InsurerMetricsRecord, type Row, yearBlockStart } from './irdaiHandbookParse.js';

export interface Table15Row {
  name: string;
  totalClaims: number;
  totalAmountCr: Decimal;
  paid: number;
  paidAmountCr: Decimal;
  repudiated: number;
  rejected: number;
  pendingEnd: number;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * An insurer row: a real serial number (number, or non-blank numeric text) and a name.
 * Blank serials (section headings, "Private Sector Total", "Grand Total") must not
 * count — `Number(null)` is 0, which would let them through.
 */
function isDataRow(r: Row): boolean {
  const sno = r[0];
  const ok = typeof sno === 'number' ? sno > 0 : typeof sno === 'string' && sno.trim() !== '' && Number(sno) > 0;
  return ok && typeof r[1] === 'string';
}

export function parseTable15(rows: Row[], fy: string): Table15Row[] {
  const header = rows.find((r) => r[0] === 'S.No.');
  if (!header) throw new Error('Table 15: header row not found');
  const s = yearBlockStart(header, fy);

  const out: Table15Row[] = [];
  for (const r of rows) {
    // Data rows carry a numeric S.No. (it is stored as a number or a numeric string).
    if (!isDataRow(r)) continue;
    const total = num(r[s + 4]);
    const totalAmt = num(r[s + 5]);
    const paid = num(r[s + 6]);
    const paidAmt = num(r[s + 7]);
    if (total === null || paid === null || totalAmt === null || paidAmt === null || total <= 0) continue;
    out.push({
      name: cleanInsurerName(r[1] as string),
      totalClaims: total,
      totalAmountCr: new Decimal(totalAmt),
      paid,
      paidAmountCr: new Decimal(paidAmt),
      repudiated: num(r[s + 8]) ?? 0,
      rejected: num(r[s + 10]) ?? 0,
      pendingEnd: num(r[s + 14]) ?? 0,
    });
  }
  return out;
}

const CRORE = new Decimal(10_000_000);

export const LIFE_METHODOLOGY =
  'Claim settlement ratio = individual death claims paid ÷ total claims (pending at start plus received in the year), ' +
  'by number and by amount, as IRDAI publishes it. It covers all individual life policies, not term plans alone, ' +
  'and is an insurer-wide figure, not the chance any one claim is paid.';

export interface Table37Row {
  name: string;
  /** Complaints reported in the year (duplicates excluded where the Handbook separates them). */
  reported: number;
  resolved: number | null;
  /** Open at year end. Only published from FY2024-25. */
  closing: number | null;
  duplicatesExcluded: number | null;
}

/**
 * Table 37 — status of grievances with life insurers (Part I, sheet 37).
 *  FY 2023-24: 5-col block [open at start, reported incl. duplicates, duplicates, actual reported, resolved].
 *  FY 2024-25: 4-col block [open at start, reported, resolved, closing balance].
 * Only these two layouts are supported; anything else throws rather than guessing.
 * Unlike Table 56 there is no claims or policy count here, so no per-policy rate is derived.
 */
export function parseTable37(rows: Row[], fy: string): Table37Row[] {
  if (fy !== '2023-24' && fy !== '2024-25') throw new Error(`Table 37: FY ${fy} layout not supported`);
  const header = rows.find((r) => r[0] === 'S.No.');
  if (!header) throw new Error('Table 37: header row not found');
  const s = yearBlockStart(header, fy);

  const out: Table37Row[] = [];
  for (const r of rows) {
    if (!isDataRow(r)) continue;
    const row: Table37Row =
      fy === '2023-24'
        ? { name: cleanInsurerName(r[1] as string), reported: num(r[s + 3]) ?? NaN, resolved: num(r[s + 4]), closing: null, duplicatesExcluded: num(r[s + 2]) }
        : { name: cleanInsurerName(r[1] as string), reported: num(r[s + 1]) ?? NaN, resolved: num(r[s + 2]), closing: num(r[s + 3]), duplicatesExcluded: null };
    if (!Number.isFinite(row.reported)) continue; // insurer did not report for this year
    out.push(row);
  }
  return out;
}

/**
 * Table 37 names → Table 15 names (as insurerKey). The two tables spell the same
 * insurer differently ("Bajaj Allianz" vs "Bajaj Allianz Life Insurance Company Ltd.").
 * Keys not listed join by their own key (HDFC Life, SBI Life, Pramerica Life).
 */
const TABLE37_TO_TABLE15: Record<string, string> = {
  'life corporation of': 'lic',
  'aditya birla sunlife': 'aditya birla sun life',
  'ageas federal life': 'ageas federal',
  'aviva life': 'aviva',
  'axis maxlife': 'axis max life',
  'bajaj allianz life': 'bajaj allianz',
  'bandhan life': 'bandhan',
  'bharti axa life': 'bharti axa',
  'canara hsbc life': 'canara hsbc',
  'edelweiss tokio life': 'edelweiss life',
  'future generali life': 'future generali',
  'go digit life': 'godigit life',
  'icici prudential life': 'icici prudential',
  'indiafirst life': 'first',
  'kotak life': 'kotak',
  'pnb metlife': 'pnb met life',
  'reliance nippon life': 'reliance nippon',
  'shriram life': 'shriram',
  'star union dai ichi life': 'star union',
  'tata aia life': 'tata aia',
};

const joinKey37 = (name: string): string => {
  const k = insurerKey(name);
  return TABLE37_TO_TABLE15[k] ?? k;
};

export const LIFE_COMPLAINTS_BASIS =
  'Grievances reported to the insurer in the year across ALL its life products (IRDAI Handbook Table 37). ' +
  'IRDAI publishes no policy count alongside it, so no per-policy rate is shown; large insurers naturally receive more.';

export function buildLifeRecords(rows: Table15Row[], fy: string, t37: Table37Row[] = []): InsurerMetricsRecord[] {
  const byKey = new Map<string, Table37Row>();
  for (const g of t37) {
    const k = joinKey37(g.name);
    const prev = byKey.get(k);
    if (!prev || g.reported > prev.reported) byKey.set(k, g);
  }
  return rows.map((c) => ({
    insurerName: c.name,
    financialYear: fy,
    claimSettlementRatio: new Decimal(c.paid).div(c.totalClaims).mul(100).toDecimalPlaces(2).toFixed(2),
    claimSettlementRatioByAmount: c.totalAmountCr.gt(0)
      ? c.paidAmountCr.div(c.totalAmountCr).mul(100).toDecimalPlaces(2).toFixed(2)
      : null,
    incurredClaimRatio: null,
    claimsTotal: c.totalClaims,
    claimsSettled: c.paid,
    claimsPending: c.pendingEnd,
    claimsRepudiated: c.repudiated + c.rejected,
    claimsPaidInr: c.paidAmountCr.mul(CRORE).toFixed(2),
    claimsIncurredInr: null,
    netEarnedPremiumInr: null,
    claimsScope: null,
    complaints: (() => {
      const g = byKey.get(insurerKey(c.name));
      return g
        ? {
            reported: g.reported,
            attended: g.resolved,
            outstandingAtYearEnd: g.closing,
            duplicatesExcluded: g.duplicatesExcluded,
            perTenThousandClaims: null,
            basis: LIFE_COMPLAINTS_BASIS,
          }
        : null;
    })(),
    segment: 'LIFE' as const,
  }));
}
