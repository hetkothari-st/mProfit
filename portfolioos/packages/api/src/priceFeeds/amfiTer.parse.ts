/**
 * AMFI's published Total Expense Ratio file, parsed.
 *
 * Pure: bytes in, rows out. No network, no database — the same split every
 * adapter in this repo uses, so the parsing is testable against a real
 * downloaded file rather than an assumed format (see
 * `test/fixtures/amfi/ter-sample.xlsx`, sliced from the live August 2026
 * workbook).
 *
 * ── What the file actually is ────────────────────────────────────
 * One row per scheme PER DAY of the month, ~63,700 rows for ~2,100 schemes.
 * Columns (verified against the live file, not assumed):
 *
 *   NSDL Scheme Code | Scheme Name | Scheme Type | Scheme Category | TER Date
 *   Regular Plan - Base Expense Ratio (BER) (%) … Regular Plan - Total TER (%)
 *   Direct Plan  - Base Expense Ratio (BER) (%) … Direct Plan  - Total TER (%)
 *
 * Two consequences drive everything below:
 *
 * 1. **There is no AMFI scheme code and no ISIN in this file.** The only join
 *    key is the base scheme name. That is a documented weakness of the source,
 *    not a shortcut: see V1-METHODOLOGY-REPORT.md. Measured against the live
 *    NAVAll universe it matches 96.7% of direct-growth schemes, and exactly
 *    one base name in the file maps to more than one NSDL code (the blank
 *    row), so the key is effectively unique.
 *
 * 2. **Plan is a column, not a row.** The file gives regular and direct TER
 *    side by side for the same scheme, so a direct-plan fund's cost comes from
 *    the `Direct Plan - Total TER (%)` column — never from a separate row.
 */

import * as XLSX from 'xlsx';

export interface TerRow {
  /** AMFI's base scheme name, e.g. "360 ONE Balanced Hybrid Fund". */
  schemeName: string;
  /** Normalised join key for that name. */
  nameKey: string;
  nsdlSchemeCode: string;
  schemeType: string;
  schemeCategory: string;
  /** The TER date this figure was published for. */
  asOf: Date;
  /** Direct-plan total TER, percent. Null when the cell is blank or unparseable. */
  directTerPct: number | null;
  /** Regular-plan total TER, percent. Kept for the audit trail; never used to advise. */
  regularTerPct: number | null;
}

export interface TerParseResult {
  rows: TerRow[];
  /** Rows the file contained that could not be read, with why. Never silently
   *  dropped — a shrinking parse rate is how a format change announces itself. */
  skipped: Array<{ reason: string; sample: string }>;
}

/** Lower-case, strip punctuation, collapse whitespace. Deterministic, and the
 *  same function is applied to both sides of the join. */
export function normaliseSchemeName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "01-Aug-2026" → Date, or null. AMFI writes this format; anything else is a
 *  format change and is reported rather than guessed at. */
export function parseTerDate(value: string): Date | null {
  const raw = String(value ?? '').trim();
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw);
  if (!m) {
    const iso = new Date(raw);
    return Number.isFinite(iso.getTime()) ? iso : null;
  }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const idx = months.indexOf(m[2]!.toLowerCase());
  if (idx < 0) return null;
  return new Date(Date.UTC(Number(m[3]), idx, Number(m[1])));
}

function percentOrNull(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (raw === '' || raw === '-') return null;
  const n = Number.parseFloat(raw);
  // A TER outside this band is a parse error, not a cheap fund: real Indian
  // TERs run from about 0.02% (index) to 2.25% (the SEBI cap).
  if (!Number.isFinite(n) || n < 0 || n > 5) return null;
  return n;
}

/** Column headers, matched loosely enough to survive AMFI re-wording but
 *  strictly enough that regular and direct are never confused. */
function findColumns(headers: string[]): {
  name?: string;
  nsdl?: string;
  type?: string;
  category?: string;
  date?: string;
  directTer?: string;
  regularTer?: string;
} {
  const find = (re: RegExp) => headers.find((h) => re.test(h));
  return {
    name: find(/^scheme name$/i),
    nsdl: find(/nsdl.*code/i),
    type: find(/^scheme type$/i),
    category: find(/^scheme categ/i),
    date: find(/ter date/i),
    directTer: find(/direct.*total\s*ter/i),
    regularTer: find(/regular.*total\s*ter/i),
  };
}

export function parseTerWorkbook(buffer: Buffer): TerParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], skipped: [{ reason: 'no_sheets', sample: '' }] };

  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, {
    raw: false,
    defval: '',
  });
  if (records.length === 0) return { rows: [], skipped: [{ reason: 'empty_sheet', sample: sheetName }] };

  const cols = findColumns(Object.keys(records[0]!));
  if (!cols.name || !cols.date || !cols.directTer) {
    // Refusing to guess: without these three the file is not the TER file we
    // know, and mapping the wrong column onto `terPct` would silently change
    // every ranking.
    return {
      rows: [],
      skipped: [{ reason: 'unexpected_columns', sample: Object.keys(records[0]!).join(' | ').slice(0, 300) }],
    };
  }

  const rows: TerRow[] = [];
  const skipped: TerParseResult['skipped'] = [];

  for (const rec of records) {
    const schemeName = String(rec[cols.name] ?? '').trim();
    if (!schemeName) {
      skipped.push({ reason: 'blank_scheme_name', sample: JSON.stringify(rec).slice(0, 120) });
      continue;
    }
    const asOf = parseTerDate(String(rec[cols.date] ?? ''));
    if (!asOf) {
      skipped.push({ reason: 'unparseable_date', sample: String(rec[cols.date] ?? '').slice(0, 40) });
      continue;
    }
    rows.push({
      schemeName,
      nameKey: normaliseSchemeName(schemeName),
      nsdlSchemeCode: String(rec[cols.nsdl ?? ''] ?? '').trim(),
      schemeType: String(rec[cols.type ?? ''] ?? '').trim(),
      schemeCategory: String(rec[cols.category ?? ''] ?? '').trim(),
      asOf,
      directTerPct: percentOrNull(rec[cols.directTer]),
      regularTerPct: cols.regularTer ? percentOrNull(rec[cols.regularTer]) : null,
    });
  }

  return { rows, skipped };
}

/**
 * One TER per scheme: the most recent dated row that actually has a direct-plan
 * figure.
 *
 * The file carries every day of the month, and TER moves within a month. The
 * latest value is the one in force, and picking it deterministically (rather
 * than averaging, or taking whichever row happened to be last in the sheet) is
 * what makes two runs over the same file agree.
 */
export function latestTerByScheme(rows: TerRow[]): Map<string, TerRow> {
  const out = new Map<string, TerRow>();
  for (const row of rows) {
    if (row.directTerPct == null) continue;
    const existing = out.get(row.nameKey);
    if (!existing || row.asOf.getTime() > existing.asOf.getTime()) out.set(row.nameKey, row);
  }
  return out;
}
