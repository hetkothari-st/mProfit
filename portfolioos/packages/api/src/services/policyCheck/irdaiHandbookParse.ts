/**
 * Pure parsers for the IRDAI "Handbook on Indian Insurance Statistics" tables
 * used by the insurer intelligence service. No I/O — takes sheet rows as
 * arrays (as produced by xlsx `sheet_to_json({header:1})`).
 *
 *  Table 53 (Part II) — Status of claims of general and health insurers, by
 *    NUMBER of claims. One 12-column block per financial year:
 *      [O/S at start, intimated, paid, repudiated, closed, O/S at end, 6 age buckets]
 *    General insurers' counts cover ALL lines of business; stand-alone health
 *    insurers' counts are health only. The scope is recorded per row.
 *
 *  Table 62 (Part III) — Health insurance (excl. PA & travel): net earned
 *    premium, net claims incurred and ICR in ₹ lakh. One 15-column block per
 *    year; the last three columns of each block are the Total.
 */

import { Decimal } from '@everypaisa/shared';

export type Row = ReadonlyArray<unknown>;

export interface Table53Row {
  name: string;
  scope: 'HEALTH_ONLY' | 'ALL_LINES';
  openingOutstanding: number;
  intimated: number;
  paid: number;
  repudiated: number;
  closed: number;
  closingOutstanding: number;
}

export interface Table62Row {
  name: string;
  netEarnedPremiumLakh: Decimal;
  claimsIncurredLakh: Decimal;
}

/** "HDFC ERGO General Insurance Co. Ltd.^^" → "HDFC ERGO General Insurance Co. Ltd." */
export function cleanInsurerName(raw: string): string {
  return raw.replace(/([a-z])(General|Health)/g, '$1 $2').replace(/[\^$*#~]+/g, '').replace(/\s+/g, ' ').trim();
}

const JOIN_NOISE = new Set([
  'insurance', 'co', 'ltd', 'limited', 'company', 'india', 'pvt', 'private', 'the', 'and', 'allied',
  // Name variants of the same insurer across / within tables:
  'zurich', 'mahindra', 'hdi',
]);

/**
 * Join key across Handbook tables. Unlike the user-facing matcher this KEEPS
 * "general"/"health" (Reliance General and Reliance Health are different
 * insurers) and folds known renames: Zurich Kotak = Kotak Mahindra,
 * Magma = Magma HDI, HDFC ERGO Health = HDFC ERGO General (merged).
 */
export function insurerKey(name: string): string {
  const spaced = name.replace(/([a-z])(General|Health)/g, '$1 $2');
  const tokens = spaced
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !JOIN_NOISE.has(t));
  const key = tokens.join(' ');
  return key === 'hdfc ergo health' ? 'hdfc ergo general' : key;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Column where a financial year's block starts ("2023-24" → its header column). */
export function yearBlockStart(headerRow: Row, fy: string): number {
  const idx = headerRow.findIndex((c) => typeof c === 'string' && c.trim() === fy);
  if (idx < 0) throw new Error(`Financial year ${fy} not found in table header`);
  return idx;
}

export function parseTable53(rows: Row[], fy: string): Table53Row[] {
  const header = rows.find((r) => r[0] === 'S.No.');
  if (!header) throw new Error('Table 53: header row not found');
  const start = yearBlockStart(header, fy);

  const out: Table53Row[] = [];
  let scope: Table53Row['scope'] = 'ALL_LINES';
  let skipSection = false;

  for (const r of rows) {
    const label = typeof r[1] === 'string' ? r[1] : typeof r[0] === 'string' ? r[0] : '';
    if (/stand-?alone health/i.test(label) && !/total/i.test(label)) {
      scope = 'HEALTH_ONLY';
      skipSection = false;
    } else if (/specialized insurers/i.test(label)) {
      skipSection = true; // agriculture / export credit: not health
    } else if (/public sector|private sector/i.test(label)) {
      scope = 'ALL_LINES';
      skipSection = false;
    }
    if (skipSection) continue;
    if (typeof r[0] !== 'number' || typeof r[1] !== 'string') continue; // data rows carry a numeric S.No.

    const open = num(r[start]);
    const intim = num(r[start + 1]);
    const paid = num(r[start + 2]);
    const rep = num(r[start + 3]);
    const closed = num(r[start + 4]);
    const end = num(r[start + 5]);
    // Insurers not yet operating in the year have no numbers — skip them.
    if (intim === null || paid === null || rep === null) continue;
    if (intim === 0 && paid === 0) continue;
    out.push({
      name: cleanInsurerName(r[1]),
      scope,
      openingOutstanding: open ?? 0,
      intimated: intim,
      paid,
      repudiated: rep,
      closed: closed ?? 0,
      closingOutstanding: end ?? 0,
    });
  }
  return out;
}

export interface Table56Row {
  name: string;
  /** Complaints reported in the year (duplicates excluded where the Handbook separates them). */
  reported: number;
  /** Complaints attended to / resolved in the year. */
  attended: number | null;
  /** Complaints still open at year end. Only published from FY2024-25. */
  closing: number | null;
  duplicatesExcluded: number | null;
}

/**
 * Table 56 — status of grievances with general and health insurers.
 *  FY ≤ 2023-24: 5-col block [opening, reported (incl. duplicates), duplicates, actual, attended].
 *  FY 2024-25 (revised format): a second sub-table to the right with its own S.No./Insurer
 *    columns, then [opening, reported, attended, closing].
 * Only these two layouts are supported; anything else throws rather than guessing.
 */
export function parseTable56(rows: Row[], fy: string): Table56Row[] {
  const header = rows.find((r) => r[0] === 'S.No.');
  if (!header) throw new Error('Table 56: header row not found');
  const out: Table56Row[] = [];

  if (fy === '2024-25') {
    // The revised-format sub-table repeats S.No./Insurer in the next header row.
    let sno = -1;
    for (const r of rows) {
      sno = r.findIndex((c, i) => i > 3 && c === 'S.No.');
      if (sno >= 0) break;
    }
    if (sno < 0) throw new Error('Table 56: revised-format block not found');
    for (const r of rows) {
      if (typeof r[sno] !== 'number' || typeof r[sno + 1] !== 'string') continue;
      const reported = num(r[sno + 3]);
      if (reported === null) continue;
      out.push({
        name: cleanInsurerName(r[sno + 1] as string),
        reported,
        attended: num(r[sno + 4]),
        closing: num(r[sno + 5]),
        duplicatesExcluded: null,
      });
    }
    return out;
  }

  if (fy !== '2023-24') throw new Error(`Table 56: FY ${fy} layout not supported`);
  const start = yearBlockStart(header, fy);
  for (const r of rows) {
    if (typeof r[0] !== 'number' || typeof r[1] !== 'string') continue;
    const actual = num(r[start + 3]);
    if (actual === null) continue;
    out.push({
      name: cleanInsurerName(r[1]),
      reported: actual,
      attended: num(r[start + 4]),
      closing: null,
      duplicatesExcluded: num(r[start + 2]),
    });
  }
  return out;
}

/** Table 62: the Total triple (NEP, claims, ICR) is the last 3 columns of a year's 15-col block. */
export function parseTable62(rows: Row[], fy: string): Table62Row[] {
  const header = rows.find((r) => r[0] === 'S.No.');
  if (!header) throw new Error('Table 62: header row not found');
  const start = yearBlockStart(header, fy);
  const nepCol = start + 12;
  const claimsCol = start + 13;

  const best = new Map<string, Table62Row>();
  for (const r of rows) {
    if (typeof r[1] !== 'string' || /total|average|sector|grand/i.test(r[1])) continue;
    const nep = num(r[nepCol]);
    const claims = num(r[claimsCol]);
    if (nep === null || claims === null || nep <= 0) continue;
    const row: Table62Row = {
      name: cleanInsurerName(r[1]),
      netEarnedPremiumLakh: new Decimal(nep),
      claimsIncurredLakh: new Decimal(claims),
    };
    // Some insurers appear on several rows (legacy/merged entities, footnoted
    // duplicates). Keep the one with the real premium.
    const key = insurerKey(row.name);
    const prev = best.get(key);
    if (!prev || row.netEarnedPremiumLakh.gt(prev.netEarnedPremiumLakh)) best.set(key, row);
  }
  return [...best.values()];
}

export interface InsurerMetricsRecord {
  insurerName: string;
  financialYear: string;
  /** % by number: paid ÷ (paid + repudiated). */
  claimSettlementRatio: string | null;
  /** %: net claims incurred ÷ net earned premium (health segment). */
  incurredClaimRatio: string | null;
  claimsTotal: number | null;
  claimsSettled: number | null;
  claimsPending: number | null;
  claimsRepudiated: number | null;
  claimsIncurredInr: string | null;
  netEarnedPremiumInr: string | null;
  claimsScope: Table53Row['scope'] | null;
  /** Insurer-wide grievances (all products). Null when not published. */
  complaints: Record<string, unknown> | null;
  /** 'HEALTH' (default) or 'LIFE'. */
  segment?: 'HEALTH' | 'LIFE';
  /** LIFE rows: death claims paid (INR) and the ratio by amount. */
  claimsPaidInr?: string | null;
  claimSettlementRatioByAmount?: string | null;
}

const LAKH = new Decimal(100000);

/** One display name per insurer so the same insurer is one name in every year. */
const CANONICAL_NAMES: Record<string, string> = {
  [insurerKey('Kotak Mahindra General Insurance Co. Ltd.')]: 'Kotak Mahindra General Insurance Co. Ltd.',
  [insurerKey('Magma HDI General Insurance Co. Ltd.')]: 'Magma HDI General Insurance Co. Ltd.',
  [insurerKey('HDFC ERGO General Insurance Co. Ltd.')]: 'HDFC ERGO General Insurance Co. Ltd.',
  [insurerKey('Future Generali India Insurance Co. Ltd.')]: 'Future Generali India Insurance Co. Ltd.',
};

export const CSR_METHODOLOGY =
  'Claim settlement ratio = claims paid ÷ (claims paid + claims repudiated), by number of claims in the year. ' +
  'Insurer-wide statistic; not the chance that any one claim is paid.';

/** Merge the two tables into one record per insurer. */
export function buildMetricRecords(
  t53: Table53Row[],
  t62: Table62Row[],
  fy: string,
  t56: Table56Row[] = [],
): InsurerMetricsRecord[] {
  const byKey = new Map<string, InsurerMetricsRecord>();

  for (const c of t53) {
    const decided = c.paid + c.repudiated;
    byKey.set(insurerKey(c.name), {
      insurerName: c.name,
      financialYear: fy,
      claimSettlementRatio:
        decided > 0 ? new Decimal(c.paid).div(decided).mul(100).toDecimalPlaces(2).toFixed(2) : null,
      incurredClaimRatio: null,
      claimsTotal: c.openingOutstanding + c.intimated,
      claimsSettled: c.paid,
      claimsPending: c.closingOutstanding,
      claimsRepudiated: c.repudiated,
      claimsIncurredInr: null,
      netEarnedPremiumInr: null,
      claimsScope: c.scope,
      complaints: null,
    });
  }

  for (const h of t62) {
    const key = insurerKey(h.name);
    const rec: InsurerMetricsRecord = byKey.get(key) ?? {
      insurerName: h.name,
      financialYear: fy,
      claimSettlementRatio: null,
      incurredClaimRatio: null,
      claimsTotal: null,
      claimsSettled: null,
      claimsPending: null,
      claimsRepudiated: null,
      claimsIncurredInr: null,
      netEarnedPremiumInr: null,
      claimsScope: null,
      complaints: null,
    };
    rec.incurredClaimRatio = h.claimsIncurredLakh
      .div(h.netEarnedPremiumLakh)
      .mul(100)
      .toDecimalPlaces(2)
      .toFixed(2);
    rec.claimsIncurredInr = h.claimsIncurredLakh.mul(LAKH).toFixed(2);
    rec.netEarnedPremiumInr = h.netEarnedPremiumLakh.mul(LAKH).toFixed(2);
    byKey.set(key, rec);
  }
  // Merged/legacy entities can appear twice (one row empty): keep the fuller one.
  const g56 = new Map<string, Table56Row>();
  for (const g of t56) {
    const k = insurerKey(g.name);
    const prev = g56.get(k);
    if (!prev || g.reported > prev.reported) g56.set(k, g);
  }
  for (const g of g56.values()) {
    const rec = byKey.get(insurerKey(g.name));
    if (!rec) continue; // grievance data only enriches insurers we already hold claims data for
    rec.complaints = {
      reported: g.reported,
      attended: g.attended,
      outstandingAtYearEnd: g.closing,
      duplicatesExcluded: g.duplicatesExcluded,
      // Scale-aware: complaints per 10,000 claims handled (same denominator scope as the claim counts).
      perTenThousandClaims:
        rec.claimsTotal && rec.claimsTotal > 0
          ? new Decimal(g.reported).div(rec.claimsTotal).mul(10000).toDecimalPlaces(1).toFixed(1)
          : null,
      basis:
        'Grievances reported to the insurer in the year across ALL its products (IRDAI Handbook Table 56). ' +
        'Per-10,000 figure divides by claims handled, not by policies.',
    };
  }
  for (const [key, rec] of byKey) rec.insurerName = CANONICAL_NAMES[key] ?? rec.insurerName;
  return [...byKey.values()].sort((a, b) => a.insurerName.localeCompare(b.insurerName));
}
