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
import { cleanInsurerName, type InsurerMetricsRecord, type Row, yearBlockStart } from './irdaiHandbookParse.js';

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

export function parseTable15(rows: Row[], fy: string): Table15Row[] {
  const header = rows.find((r) => r[0] === 'S.No.');
  if (!header) throw new Error('Table 15: header row not found');
  const s = yearBlockStart(header, fy);

  const out: Table15Row[] = [];
  for (const r of rows) {
    // Data rows carry a numeric S.No. (it is stored as a number or a numeric string).
    const sno = typeof r[0] === 'number' ? r[0] : Number(r[0]);
    if (!Number.isFinite(sno) || typeof r[1] !== 'string') continue;
    const total = num(r[s + 4]);
    const totalAmt = num(r[s + 5]);
    const paid = num(r[s + 6]);
    const paidAmt = num(r[s + 7]);
    if (total === null || paid === null || totalAmt === null || paidAmt === null || total <= 0) continue;
    out.push({
      name: cleanInsurerName(r[1]),
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

export function buildLifeRecords(rows: Table15Row[], fy: string): InsurerMetricsRecord[] {
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
    complaints: null,
    segment: 'LIFE' as const,
  }));
}
