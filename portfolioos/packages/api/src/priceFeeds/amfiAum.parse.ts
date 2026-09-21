/**
 * AMFI's scheme-wise average AUM, parsed.
 *
 * Pure: JSON in, rows out. Fixture in `test/fixtures/amfi/aum-schemewise.json`
 * is a real response from the live endpoint, not a hand-written shape.
 *
 * ── What the payload is ──────────────────────────────────────────
 * `/api/average-aum-schemewise?strType=Categorywise&fyId=&periodId=&MF_ID=`
 * returns one group per (AMC × scheme category), each holding scheme rows:
 *
 *   { Mfname, SchemeCat_Desc, schemes: [
 *       { SchemeNAVName, AMFI_Code,
 *         AverageAumForTheMonth: {
 *           ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas,
 *           FundOfFundsDomestic } } ] }
 *
 * Unlike the TER file, this one carries **AMFI_Code** — the same scheme code
 * `MutualFundMaster` is keyed on — so the join is exact and needs no name
 * matching at all.
 *
 * ── Units ────────────────────────────────────────────────────────
 * AMFI publishes these figures in ₹ LAKH. They are converted to rupees here,
 * once, at the parse boundary, so every consumer downstream is in the same
 * unit as the rest of the codebase. A ₹51 crore fund read as ₹5,099 would sail
 * under any size floor ever configured.
 */

import { Decimal } from 'decimal.js';

export interface AumRow {
  /** AMFI scheme code — the exact join key to MutualFundMaster.schemeCode. */
  schemeCode: string;
  schemeName: string;
  amcName: string;
  schemeCategory: string;
  /** Average AUM for the period, in RUPEES (converted from the published lakh). */
  aumInr: Decimal;
}

export interface AumParseResult {
  rows: AumRow[];
  skipped: Array<{ reason: string; sample: string }>;
}

const LAKH = new Decimal(100_000);

/** AMFI publishes in lakh; everything in this codebase is in rupees. */
export function lakhToRupees(lakh: number | string): Decimal {
  return new Decimal(lakh).times(LAKH);
}

interface RawScheme {
  SchemeNAVName?: unknown;
  AMFI_Code?: unknown;
  AverageAumForTheMonth?: {
    ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas?: unknown;
    FundOfFundsDomestic?: unknown;
  };
}

interface RawGroup {
  Mfname?: unknown;
  SchemeCat_Desc?: unknown;
  schemes?: unknown;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseSchemeWiseAum(payload: unknown): AumParseResult {
  const rows: AumRow[] = [];
  const skipped: AumParseResult['skipped'] = [];

  const groups = (payload as { data?: unknown })?.data;
  if (!Array.isArray(groups)) {
    return { rows, skipped: [{ reason: 'unexpected_payload', sample: JSON.stringify(payload).slice(0, 200) }] };
  }

  for (const rawGroup of groups as RawGroup[]) {
    const amcName = String(rawGroup?.Mfname ?? '').trim();
    const category = String(rawGroup?.SchemeCat_Desc ?? '').trim();
    const schemes = Array.isArray(rawGroup?.schemes) ? (rawGroup.schemes as RawScheme[]) : [];

    // "Grand Total" rows carry no schemes and are a summary, not data.
    if (schemes.length === 0) continue;

    for (const scheme of schemes) {
      const code = String(scheme?.AMFI_Code ?? '').trim();
      if (!code || !/^\d+$/.test(code)) {
        skipped.push({ reason: 'missing_amfi_code', sample: JSON.stringify(scheme).slice(0, 140) });
        continue;
      }
      const lakh = numberOrNull(
        scheme?.AverageAumForTheMonth?.ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas,
      );
      if (lakh == null) {
        skipped.push({ reason: 'missing_aum_value', sample: JSON.stringify(scheme).slice(0, 140) });
        continue;
      }
      // A zero AUM is a real answer for a scheme that has not launched or has
      // wound down — it is kept, and the eligibility floor deals with it.
      rows.push({
        schemeCode: code,
        schemeName: String(scheme?.SchemeNAVName ?? '').trim(),
        amcName,
        schemeCategory: category,
        aumInr: lakhToRupees(lakh),
      });
    }
  }

  return { rows, skipped };
}

/** The AMC list, from the fund-wise endpoint, so the scheme-wise pass knows
 *  which MF_IDs to ask for. */
export function parseFundWiseAmcNames(payload: unknown): string[] {
  const rows = (payload as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => String((r as { MutualFundName?: unknown })?.MutualFundName ?? '').trim())
    .filter((name) => name !== '' && name.toLowerCase() !== 'grand total');
}
