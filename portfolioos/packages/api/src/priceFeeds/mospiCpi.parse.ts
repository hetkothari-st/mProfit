/**
 * Pure parsers for MoSPI's CPI API (eSankhyiki). No I/O — the fetcher in
 * `mospiCpi.v1.ts` hands the raw body here. Fixture-tested against real
 * captured responses in `test/fixtures/cpi/` (see its README for requests).
 *
 * Two series, two shapes:
 *  - base 2024 (`getCPIData`): COICOP divisions. We keep only division-level
 *    rows (`group === null`) — the 13 numbers the feature needs.
 *  - base 2012 (`getCPIIndex`): old group/subgroup taxonomy, used only for
 *    YoY history. `legacyRowsToDivisions` maps it onto the new divisions.
 *
 * A missing reading (`null`, blank, "-", "NA") is a row failure and produces
 * NO row. It is never coerced to zero: a zero YoY would quietly drag every
 * long-run rate it touches toward zero and still look plausible.
 */

import { Decimal } from 'decimal.js';
import {
  CPI_GENERAL_DIVISION,
  LEGACY_SUBGROUPS_BY_DIVISION,
  isCpiDivisionCode,
  type CpiSector,
} from '@everypaisa/shared';

export interface CpiRow {
  baseYear: 2024 | 2012;
  /** Base-2024 state code (1 = All India), even for rows from the old series. */
  stateCode: number;
  sector: CpiSector;
  /** '00' headline, '01'..'13' divisions. */
  divisionCode: string;
  year: number;
  month: number;
  /** Index level. Null for legacy rows (different base, and some are averages). */
  indexValue: Decimal | null;
  /** Year-on-year change, in percent (5.54 = 5.54%). */
  inflationPct: Decimal;
}

export interface CpiParseFailure {
  reason:
    | 'missing_inflation'
    | 'bad_inflation'
    | 'bad_period'
    | 'unknown_sector'
    | 'unknown_division';
  raw: string;
}

export type CpiPageParse<R> =
  | { kind: 'ok'; rows: R[]; failures: CpiParseFailure[]; totalPages: number }
  /** The API's "No Data Found": a month not yet released. Not an error. */
  | { kind: 'empty' }
  | { kind: 'fatal'; reason: 'not_json' | 'api_error' | 'unexpected_shape' | 'no_division_rows'; detail: string };

/** One old-series subgroup reading, before mapping onto divisions. */
export interface LegacySubgroupRow {
  sector: CpiSector;
  subgroup: string;
  year: number;
  month: number;
  inflationPct: Decimal;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const SECTORS: Record<string, CpiSector> = {
  rural: 'RURAL',
  urban: 'URBAN',
  combined: 'COMBINED',
};

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function parsePeriod(r: Raw): { year: number; month: number } | null {
  const year = Number.parseInt(str(r['year']) ?? '', 10);
  const month = MONTHS.indexOf((str(r['month']) ?? '').toLowerCase()) + 1;
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || month < 1) return null;
  return { year, month };
}

function parseSector(r: Raw): CpiSector | null {
  return SECTORS[(str(r['sector']) ?? '').toLowerCase()] ?? null;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;
const MISSING = new Set(['-', 'NA', 'N.A.', 'na']);

/** YoY percent, or a failure reason. */
function parseInflation(v: unknown): Decimal | 'missing_inflation' | 'bad_inflation' {
  const s = str(v);
  if (s === null || MISSING.has(s)) return 'missing_inflation';
  if (!NUMERIC.test(s)) return 'bad_inflation';
  const d = new Decimal(s);
  // CPI YoY outside ±100% is a garbled cell, not inflation.
  if (d.abs().greaterThanOrEqualTo(100)) return 'bad_inflation';
  return d;
}

function parseIndex(v: unknown): Decimal | null {
  const s = str(v);
  return s !== null && NUMERIC.test(s) ? new Decimal(s) : null;
}

/**
 * Shared envelope handling. Both endpoints answer errors with HTTP 200 and an
 * `error` / `message` body, and "no data" with `{ data: [], msg: 'No Data Found' }`.
 */
function envelope(text: string):
  | { kind: 'data'; data: Raw[]; totalPages: number }
  | { kind: 'empty' }
  | { kind: 'fatal'; reason: 'not_json' | 'api_error' | 'unexpected_shape'; detail: string } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { kind: 'fatal', reason: 'not_json', detail: `Body is not JSON: ${text.trimStart().slice(0, 120)}` };
  }
  if (typeof body !== 'object' || body === null) {
    return { kind: 'fatal', reason: 'unexpected_shape', detail: 'Body is not an object' };
  }
  const b = body as Raw;
  const apiError = str(b['error']) ?? (b['success'] === false ? str(b['message']) : null);
  if (apiError) return { kind: 'fatal', reason: 'api_error', detail: apiError };
  if (!Array.isArray(b['data'])) {
    return { kind: 'fatal', reason: 'unexpected_shape', detail: 'Body has no data array' };
  }
  const data = b['data'] as Raw[];
  if (data.length === 0) return { kind: 'empty' };
  const meta = (b['meta_data'] ?? {}) as Raw;
  const totalPages = Number.parseInt(str(meta['totalPages']) ?? '1', 10);
  return { kind: 'data', data, totalPages: Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 1 };
}

/**
 * Parse one page of the base-2024 series fetched with a `state_code` filter.
 * `stateCode` is the code the request asked for; the body's state *name* is
 * not trusted (spellings differ across MoSPI's own endpoints).
 */
export function parseCpi2024Page(text: string, stateCode: number): CpiPageParse<CpiRow> {
  const env = envelope(text);
  if (env.kind !== 'data') return env;

  const rows: CpiRow[] = [];
  const failures: CpiParseFailure[] = [];
  let divisionRowsSeen = 0;

  for (const r of env.data) {
    // Division level only: group, class, sub-class and item all null.
    if (r['group'] !== null && r['group'] !== undefined) continue;
    divisionRowsSeen += 1;
    const raw = JSON.stringify(r).slice(0, 300);

    const period = parsePeriod(r);
    if (!period) { failures.push({ reason: 'bad_period', raw }); continue; }
    const sector = parseSector(r);
    if (!sector) { failures.push({ reason: 'unknown_sector', raw }); continue; }
    const code = str(r['code']) ?? (str(r['division']) === 'CPI (General)' ? CPI_GENERAL_DIVISION : null);
    if (!code || !isCpiDivisionCode(code)) { failures.push({ reason: 'unknown_division', raw }); continue; }
    const inflation = parseInflation(r['inflation']);
    if (typeof inflation === 'string') { failures.push({ reason: inflation, raw }); continue; }

    rows.push({
      baseYear: 2024,
      stateCode,
      sector,
      divisionCode: code,
      year: period.year,
      month: period.month,
      indexValue: parseIndex(r['index']),
      inflationPct: inflation,
    });
  }

  if (divisionRowsSeen === 0) {
    return {
      kind: 'fatal',
      reason: 'no_division_rows',
      detail:
        'Page has data but no division-level rows (group = null). MoSPI has changed its ' +
        'ordering or shape — division rows used to lead page 1 of a state-filtered request.',
    };
  }
  return { kind: 'ok', rows, failures, totalPages: env.totalPages };
}

const LEGACY_SUBGROUPS = new Set(Object.values(LEGACY_SUBGROUPS_BY_DIVISION).flat());

/** Parse one page of the base-2012 series. Keeps only subgroups we map. */
export function parseCpi2012Page(text: string): CpiPageParse<LegacySubgroupRow> {
  const env = envelope(text);
  if (env.kind !== 'data') return env;

  const rows: LegacySubgroupRow[] = [];
  const failures: CpiParseFailure[] = [];
  for (const r of env.data) {
    const subgroup = str(r['subgroup']);
    if (!subgroup || !LEGACY_SUBGROUPS.has(subgroup)) continue;
    const raw = JSON.stringify(r).slice(0, 300);
    const period = parsePeriod(r);
    if (!period) { failures.push({ reason: 'bad_period', raw }); continue; }
    const sector = parseSector(r);
    if (!sector) { failures.push({ reason: 'unknown_sector', raw }); continue; }
    const inflation = parseInflation(r['inflation']);
    if (typeof inflation === 'string') {
      // Rural Housing is structurally absent from the old series; that is a
      // known gap, not a defect worth a DLQ row.
      if (!(inflation === 'missing_inflation' && subgroup === 'Housing-Overall')) {
        failures.push({ reason: inflation, raw });
      }
      continue;
    }
    rows.push({ sector, subgroup, year: period.year, month: period.month, inflationPct: inflation });
  }
  return { kind: 'ok', rows, failures, totalPages: env.totalPages };
}

/**
 * Map old-series subgroup readings onto new divisions. Where a division draws
 * on several subgroups ('04' = Housing + Fuel & Light) the readings that exist
 * are averaged; a division with none of its subgroups present gets no row.
 * Call with ALL pages of a request, so a split across pages cannot drop a half.
 */
export function legacyRowsToDivisions(rows: readonly LegacySubgroupRow[], stateCode: number): CpiRow[] {
  const byKey = new Map<string, Decimal>();
  for (const r of rows) byKey.set(`${r.sector}|${r.year}|${r.month}|${r.subgroup}`, r.inflationPct);

  const periods = new Map<string, { sector: CpiSector; year: number; month: number }>();
  for (const r of rows) periods.set(`${r.sector}|${r.year}|${r.month}`, r);

  const out: CpiRow[] = [];
  for (const [pKey, p] of periods) {
    for (const [divisionCode, subgroups] of Object.entries(LEGACY_SUBGROUPS_BY_DIVISION)) {
      const values = subgroups
        .map((s) => byKey.get(`${pKey}|${s}`))
        .filter((v): v is Decimal => v !== undefined);
      if (values.length === 0) continue;
      const avg = values.reduce((s, v) => s.plus(v), new Decimal(0)).dividedBy(values.length);
      out.push({
        baseYear: 2012,
        stateCode,
        sector: p.sector,
        divisionCode,
        year: p.year,
        month: p.month,
        indexValue: null,
        inflationPct: avg.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN),
      });
    }
  }
  return out;
}
