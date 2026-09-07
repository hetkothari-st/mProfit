/**
 * Generic monthly-portfolio table walker, shared by every AMC parser.
 *
 * PURE. No Prisma, no network, no filesystem.
 *
 * ---------------------------------------------------------------------------
 * Why one walker instead of three
 * ---------------------------------------------------------------------------
 *
 * SEBI mandates the CONTENT of the monthly portfolio disclosure, not its
 * layout. Every AMC therefore publishes the same columns — instrument, ISIN,
 * industry-or-rating, quantity, market value, % to NAV — under its own header
 * wording, with its own section headings and its own footnote decorations, in
 * its own units (lakh vs crore).
 *
 * So the *shape* is common and the *labels* are not. This file owns the shape:
 * find the header row, carry section state down the rows, skip the subtotals,
 * turn a data row into a `ParsedHoldingRow`. Each `<amc>.parse.ts` owns only its
 * `AmcTableSpec` — the labels, the section markers, the units.
 *
 * The alternative, three near-identical 200-line walkers, was rejected for the
 * obvious reason: a bug fixed in one would live on in the other two, and the
 * bugs in this kind of code (an off-by-one on the header row, a subtotal
 * counted as a holding) do not throw. They quietly change a concentration
 * number by a few points.
 */

import { Decimal, serializePct, serializeQuantity } from '@portfolioos/shared';
import type { Pct } from '@portfolioos/shared';
import {
  classifyHoldingKind,
  headerKey,
  moneyOrNull,
  normaliseHoldingCreditRating,
  normaliseIsin,
  parseFactsheetDate,
  parseIndianDecimal,
  resolveMarketCapBucket,
  validateSnapshot,
  croreToInr,
  lakhToInr,
} from './normalise.js';
import { computeFactsheetSourceHash, factsheetFail, factsheetOk } from './types.js';
import type {
  HoldingRowFailure,
  MfFactsheetResult,
  MfFactsheetWarning,
  ParsedHoldingRow,
  PortfolioParseInput,
  PortfolioRaw,
} from './types.js';

/** Logical columns. Every AMC has the first six; the rest are optional. */
export interface AmcColumnAliases {
  /** Header keys (see `headerKey`) that identify each logical column. */
  name: readonly string[];
  isin: readonly string[];
  industryOrRating: readonly string[];
  quantity: readonly string[];
  marketValue: readonly string[];
  weight: readonly string[];
  ytm?: readonly string[];
  maturity?: readonly string[];
  issuer?: readonly string[];
}

export interface AmcTableSpec {
  amcCode: string;
  /**
   * Units the market-value column is quoted in. Getting this wrong is a
   * factor-of-100 error in `MfPortfolioHolding.marketValue` that no downstream
   * check would catch, because weights — which every metric actually uses —
   * would still be right.
   */
  marketValueUnit: 'LAKH' | 'CRORE' | 'RUPEE';
  columns: AmcColumnAliases;
  /**
   * Rows whose name cell matches are structural, not holdings: subtotals,
   * grand totals, footnotes, disclaimers. Their weights MUST NOT be summed —
   * counting a "Sub Total 95.20" line as a holding roughly doubles the
   * weights sum and would fail an otherwise perfect snapshot.
   */
  ignoreNameRe: RegExp;
  /**
   * Rows that are SECTION HEADINGS EVEN THOUGH THEY CARRY NUMBERS.
   *
   * Added 2026-09-07 after diffing the ten parsers against real downloads. The
   * original `looksLikeSection` rule — "a name and no numbers" — is true of
   * SBI, HDFC, Nippon, Axis and Mirae, and FALSE of ICICI Pru, ABSL and UTI,
   * which print each section's subtotal on the heading row itself:
   *
   *   Equity & Equity Related Instruments (Note -1) | | | | 5570801.45 | 74.72%
   *   Listed / Awaiting Listing On Stock Exchanges  | | | | 5264555.66 | 70.61%
   *
   * Read as holdings, those two lines alone add ~145 percentage points to the
   * weights sum, so the 97–103% gate rejects a file that is in fact perfect.
   * That is the failure mode this whole exercise exists to catch: the parser
   * and its synthetic fixture agreed with each other and not with the AMC.
   *
   * Matching rows are section state, never holdings — checked BEFORE the
   * "does it carry numbers?" test, because for these AMCs it always does.
   */
  sectionNameRe?: RegExp;
  /**
   * The row that ends the holdings table. Everything below it is notes.
   *
   * Every one of the ten real disclosures terminates in a grand-total row and
   * then continues with per-plan NAV tables, derivative disclosures, portfolio
   * turnover, YTM/duration blocks and footnotes — and several of those trailing
   * tables have their own numeric columns that land under the mapped header
   * positions. Walking them produces junk holdings that are individually
   * plausible and collectively fatal to the weights gate.
   *
   * Stopping at the grand total is safe precisely because it is universal:
   * `GRAND TOTAL`, `GRAND TOTAL (AUM)`, `Grand Total`, `Total Net Assets` and
   * UTI's `TOTAL : <scheme name>` all appear after the last real holding.
   */
  endOfTableRe?: RegExp;
  /** Patterns that extract the disclosure's own as-of date from the preamble. */
  asOfPatterns: readonly RegExp[];
}

/**
 * Default end-of-table marker, covering all ten AMCs' real wording. A spec may
 * override it, but none of the ten currently needs to.
 */
export const DEFAULT_END_OF_TABLE_RE =
  /^(grand\s*total|total\s+net\s+assets|net\s+assets\s+total)\b/i;

/**
 * Structural rows to skip, covering all ten AMCs' real subtotal wording.
 *
 * Before the 2026-09-07 verification each parser carried its own near-identical
 * copy of this, which is how a real difference hid: the ten real files use
 * `Sub Total` (HDFC, Mirae), `Subtotal` (Nippon), `Total` (SBI, ABSL, DSP,
 * Kotak, Axis) and `TOTAL:` / `TOTAL :` (UTI) — five spellings across ten
 * parsers whose ten regexes were assumed to differ per AMC but did not.
 *
 * `total\b` deliberately matches as a PREFIX so that UTI's
 * "TOTAL : UTI Retirement Fund" and ICICI Pru's "Total Net Assets" are both
 * caught without enumerating scheme names.
 */
export const SHARED_IGNORE_NAME_RE =
  /^(sub[\s-]*total|total\b|grand\s*total|net\s+assets?\b|notes?\s*[:&]|notes?$|footnote|disclaimer|\(?[a-z]\)?$)/i;

export interface WalkResult {
  asOf: Date | null;
  holdings: ParsedHoldingRow[];
  rowFailures: HoldingRowFailure[];
  warnings: MfFactsheetWarning[];
  /** True when no header row could be located at all. */
  headerFound: boolean;
}

type ColumnIndex = Partial<Record<keyof AmcColumnAliases, number>>;

/**
 * Map a candidate header row onto logical columns.
 *
 * Returns the number of REQUIRED columns matched, so the caller can pick the
 * best candidate row rather than the first plausible one — these workbooks
 * often carry a decorative banner above the real header whose cells happen to
 * contain one matching word.
 */
function mapHeader(cells: readonly string[], aliases: AmcColumnAliases): {
  index: ColumnIndex;
  matched: number;
} {
  const index: ColumnIndex = {};
  const keys = cells.map(headerKey);

  const assign = (logical: keyof AmcColumnAliases, candidates: readonly string[] | undefined) => {
    if (candidates === undefined) return;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i] ?? '';
      if (key.length === 0) continue;
      // `startsWith` rather than equality: "%tonav" must match a header cell
      // rendered as "% to NAV (as on 31-Mar-2026)". Aliases are ordered
      // longest-first by each spec so a prefix never steals a longer match.
      if (candidates.some((c) => key === c || key.startsWith(c))) {
        if (index[logical] === undefined) index[logical] = i;
        return;
      }
    }
  };

  assign('name', aliases.name);
  assign('isin', aliases.isin);
  assign('industryOrRating', aliases.industryOrRating);
  assign('quantity', aliases.quantity);
  assign('marketValue', aliases.marketValue);
  assign('weight', aliases.weight);
  assign('ytm', aliases.ytm);
  assign('maturity', aliases.maturity);
  assign('issuer', aliases.issuer);

  // Only the four load-bearing columns count towards "is this the header?".
  // YTM/maturity/issuer are optional and absent from equity disclosures.
  const required: (keyof AmcColumnAliases)[] = ['name', 'isin', 'weight', 'marketValue'];
  const matched = required.filter((r) => index[r] !== undefined).length;
  return { index, matched };
}

function cell(row: readonly string[], i: number | undefined): string {
  if (i === undefined) return '';
  return (row[i] ?? '').trim();
}

/**
 * Read the instrument name, tolerating a name column that is MERGED or INDENTED.
 *
 * Added 2026-09-07 from the real Kotak workbook, whose header merges A:C into a
 * single "Name of Instrument" cell while the values sit in column C:
 *
 *   Name of Instrument | | | ISIN Code | Industry | Yield | Quantity | ...
 *                      | | BHARAT PETROLEUM CORPORATION LTD. | INE029A01011 | ...
 *
 * `mapHeader` records the header's own column (0), so a plain `row[0]` read
 * returns "" for every holding and the whole file becomes MISSING_NAME rows.
 * ABSL and SBI indent similarly (values in column C under a header that starts
 * at column C, with an internal security code in column B).
 *
 * The scan is bounded on the right by the next mapped column, so it can only
 * ever pick up cells that belong to no other logical column — it cannot steal
 * an ISIN or a quantity. Section headings, which are indented one level
 * further than their holdings, are found by the same walk.
 */
function nameCell(row: readonly string[], index: ColumnIndex): string {
  const start = index.name;
  if (start === undefined) return '';
  const direct = cell(row, start);
  if (direct.length > 0) return direct;

  // Right edge: the nearest other mapped column after the name column.
  let limit = row.length;
  for (const key of Object.keys(index) as (keyof AmcColumnAliases)[]) {
    if (key === 'name') continue;
    const at = index[key];
    if (at !== undefined && at > start && at < limit) limit = at;
  }
  for (let c = start + 1; c < limit; c += 1) {
    const v = cell(row, c);
    if (v.length > 0) return v;
  }
  return '';
}

/**
 * Does this row carry data in any column the header actually mapped?
 *
 * Used to tell "a row of the holdings table with a missing name" (a real data
 * defect worth a row failure) from "a row that is not part of the holdings
 * table at all". The real DSP workbook needs the distinction: a second,
 * unrelated sector-allocation table is glued to the right of the holdings at
 * columns K/L, and it outruns the holdings by dozens of rows. Those rows are
 * not empty, so without this check every one of them is reported as a
 * MISSING_NAME failure and the DLQ fills with noise that hides real defects.
 */
function hasMappedData(row: readonly string[], index: ColumnIndex): boolean {
  for (const key of ['weight', 'marketValue', 'quantity', 'isin'] as const) {
    if (cell(row, index[key]).length > 0) return true;
  }
  return false;
}

/**
 * A row with text in the name column and nothing in any numeric column is a
 * SECTION HEADING ("EQUITY & EQUITY RELATED", "DEBT INSTRUMENTS"). Carrying
 * that state down the rows is the single most important thing this walker
 * does — see `classifyHoldingKind` for why misfiling a bond as a share is not
 * a cosmetic error.
 */
function looksLikeSection(row: readonly string[], index: ColumnIndex): boolean {
  const name = nameCell(row, index);
  if (name.length === 0) return false;
  // "Empty" has to include the AMCs' explicit nil markers. SBI, Mirae and
  // ICICI Pru print a section that holds nothing as the literal string "NIL" /
  // "Nil" in the value and weight columns rather than leaving them blank:
  //
  //   MONEY MARKET INSTRUMENTS | | | | NIL | NIL
  //
  // Treating a non-empty "NIL" as a number-bearing row demoted every such
  // heading to a holding, which then failed as UNPARSEABLE_WEIGHT — filling
  // the DLQ with rows that are not defects, and worse, losing the section
  // state that `classifyHoldingKind` needs for every row underneath it.
  const blankish = (v: string): boolean =>
    v.length === 0 || /^(nil|n\.?\s*a\.?|none|-+|–+|—+)$/i.test(v);
  return (
    blankish(cell(row, index.weight)) &&
    blankish(cell(row, index.quantity)) &&
    blankish(cell(row, index.marketValue))
  );
}

/**
 * Derive the issuer for a debt row from its instrument name when the AMC does
 * not disclose an issuer column (most do not).
 *
 * "7.26% GOI 2033" → "GOI"; "8.15% HDFC Bank Ltd NCD 12-Mar-2029" → "HDFC Bank
 * Ltd NCD". Strips the leading coupon and any trailing year or date, because
 * `topIssuerPct` (`02 §7`) has to group two tranches of the same issuer's paper
 * together — and "7.26% GOI 2033" and "7.18% GOI 2037" are one issuer, not two.
 *
 * Returns `null` rather than the raw name when nothing survives the strip: a
 * bad issuer string silently splits one issuer's concentration in half, which
 * understates exactly the risk this metric exists to show.
 */
export function deriveIssuer(securityName: string): string | null {
  let s = securityName.trim();
  s = s.replace(/^\d+(\.\d+)?\s*%\s*/i, '');
  s = s.replace(/\s*[-–]?\s*(\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4})\s*$/i, '');
  s = s.replace(/\s*[-–]?\s*(19|20)\d{2}\s*$/i, '');
  s = s.replace(/\s*\*+$/, '').trim();
  return s.length === 0 ? null : s;
}

/**
 * Walk a flattened disclosure grid into holdings.
 *
 * Never throws. Every unusable row lands in `rowFailures` with a reason
 * (`CONTEXT.md §3.5`); the caller decides whether the snapshot as a whole
 * survives, via `validateSnapshot`.
 */
export function walkHoldingsTable(
  input: PortfolioParseInput,
  spec: AmcTableSpec,
): WalkResult {
  const holdings: ParsedHoldingRow[] = [];
  const rowFailures: HoldingRowFailure[] = [];
  const warnings: MfFactsheetWarning[] = [];

  // ── 1. Locate the header row ────────────────────────────────────────────
  let headerRow = -1;
  let index: ColumnIndex = {};
  let best = 0;
  for (let r = 0; r < input.rows.length; r += 1) {
    const candidate = mapHeader(input.rows[r] ?? [], spec.columns);
    if (candidate.matched > best) {
      best = candidate.matched;
      headerRow = r;
      index = candidate.index;
    }
    // 4/4 is unambiguous; stop rather than let a later decorative row win.
    if (candidate.matched === 4) break;
  }

  // Three of four is the floor. Two could be coincidence in a banner row, and a
  // mis-located header means every subsequent column read is off by an unknown
  // amount — silently, because the values still parse as numbers.
  if (headerRow < 0 || best < 3) {
    return { asOf: null, holdings, rowFailures, warnings, headerFound: false };
  }

  // ── 2. As-of, from the preamble above the header ────────────────────────
  const preamble = input.rows
    .slice(0, headerRow)
    .map((row) => row.join(' '))
    .join('\n');
  let asOf: Date | null = null;
  for (const pattern of spec.asOfPatterns) {
    const m = preamble.match(pattern);
    if (m !== null) {
      asOf = parseFactsheetDate(m[1] ?? null);
      if (asOf !== null) break;
    }
  }
  if (asOf === null && input.expectedAsOf !== undefined) {
    // Falling back to the caller's expectation is acceptable ONLY with a note.
    // Silently adopting it would let a stale file be filed under the month we
    // asked for, which is the one failure mode that survives every downstream
    // check because nothing else knows what month the file claimed.
    asOf = input.expectedAsOf;
    warnings.push({
      code: 'FIELD_MISSING',
      field: 'asOf',
      detail: 'Disclosure carried no readable as-of date; used the requested as-of.',
    });
  }
  if (
    asOf !== null &&
    input.expectedAsOf !== undefined &&
    asOf.getTime() !== input.expectedAsOf.getTime()
  ) {
    warnings.push({
      code: 'ASOF_MISMATCH',
      field: 'asOf',
      detail:
        `Document states ${asOf.toISOString().slice(0, 10)} but ` +
        `${input.expectedAsOf.toISOString().slice(0, 10)} was requested; ` +
        'the document wins.',
    });
  }

  // ── 3. Walk the data rows ───────────────────────────────────────────────
  let section: string | null = null;

  for (let r = headerRow + 1; r < input.rows.length; r += 1) {
    const row = input.rows[r] ?? [];
    const rowIndex = holdings.length + rowFailures.length;

    if (row.every((c) => c.trim().length === 0)) continue;

    const name = nameCell(row, index);

    // The grand total ends the holdings table; everything below it is the
    // notes/NAV/derivative trailer that every real disclosure carries. Break,
    // do not `continue`, or those trailing tables get walked as holdings.
    const endRe = spec.endOfTableRe ?? DEFAULT_END_OF_TABLE_RE;
    if (endRe.test(name)) break;

    // Section headings that carry their own subtotal (ICICI Pru) must be
    // recognised as headings BEFORE the numeric test below, because for those
    // AMCs the numeric test can never identify them.
    //
    // The ISIN/quantity guard is what makes this safe. ICICI Pru uses the SAME
    // string for a heading and for the instruments underneath it:
    //
    //   Government Securities |              | | 557364.14 | 7.47%   <- heading
    //   Government Securities | IN0020250018 | 87500000 | 80000.90 | 1.07%  <- holding
    //
    // A name-only rule would delete every government bond in the fund. A real
    // instrument always carries an ISIN or a quantity; a heading never does.
    if (
      spec.sectionNameRe !== undefined &&
      spec.sectionNameRe.test(name) &&
      cell(row, index.isin).length === 0 &&
      cell(row, index.quantity).length === 0
    ) {
      section = name;
      continue;
    }

    if (spec.ignoreNameRe.test(name)) continue;

    if (looksLikeSection(row, index)) {
      section = name;
      continue;
    }

    if (name.length === 0) {
      // Only a row inside the holdings table can be "missing" a name. A row
      // with nothing in any mapped column belongs to a side table (DSP glues a
      // sector-allocation grid to the right of the holdings) and is skipped
      // silently rather than reported as a defect it is not.
      if (!hasMappedData(row, index)) continue;
      rowFailures.push({
        rowIndex,
        raw: row.join(' | '),
        reason: 'MISSING_NAME',
        detail: 'Row carries numbers but no instrument name.',
      });
      continue;
    }

    const weight = parseIndianDecimal(cell(row, index.weight));
    if (weight === null) {
      rowFailures.push({
        rowIndex,
        raw: row.join(' | '),
        reason: 'UNPARSEABLE_WEIGHT',
        detail: `Weight cell ${JSON.stringify(cell(row, index.weight))} is not a number.`,
      });
      continue;
    }

    const isin = normaliseIsin(cell(row, index.isin));
    const industryOrRating = cell(row, index.industryOrRating);
    const kind = classifyHoldingKind({
      securityName: name,
      section,
      industryOrRating,
      isin,
    });

    // The Industry/Rating column is one column doing two jobs. Which job
    // depends on the kind, which is why classification has to happen first.
    const creditRating = kind === 'DEBT' ? normaliseHoldingCreditRating(industryOrRating) : null;
    const sector = kind === 'EQUITY' && industryOrRating.length > 0 ? industryOrRating : null;

    if (kind === 'DEBT' && industryOrRating.length > 0 && creditRating === null) {
      warnings.push({
        code: 'UNRECOGNISED_RATING',
        field: `holdings[${rowIndex}].creditRating`,
        detail: `Could not place ${JSON.stringify(industryOrRating)} on the ladder.`,
      });
    }

    const marketCapBucket =
      kind === 'EQUITY' ? resolveMarketCapBucket(isin, input.marketCapLookup) : null;
    if (kind === 'EQUITY' && isin !== null && marketCapBucket === null) {
      warnings.push({
        code: 'UNCLASSIFIED_MARKET_CAP',
        field: `holdings[${rowIndex}].marketCapBucket`,
        detail: `${isin} is not on the seeded AMFI half-yearly list; reported as unclassified.`,
      });
    }
    if (kind === 'EQUITY' && isin === null) {
      warnings.push({
        code: 'UNRESOLVED_ISIN',
        field: `holdings[${rowIndex}].isin`,
        detail: `${name} disclosed without a usable ISIN; kept and counted, not sector-mapped.`,
      });
    }

    const rawMv = parseIndianDecimal(cell(row, index.marketValue));
    const marketValue =
      rawMv === null
        ? null
        : spec.marketValueUnit === 'LAKH'
          ? lakhToInr(rawMv)
          : spec.marketValueUnit === 'CRORE'
            ? croreToInr(rawMv)
            : rawMv;

    const qty = parseIndianDecimal(cell(row, index.quantity));
    const ytm = kind === 'DEBT' ? parseIndianDecimal(cell(row, index.ytm)) : null;
    const maturityDate = kind === 'DEBT' ? parseFactsheetDate(cell(row, index.maturity)) : null;
    const issuerCell = cell(row, index.issuer);
    const issuer =
      kind === 'DEBT' ? (issuerCell.length > 0 ? issuerCell : deriveIssuer(name)) : null;

    holdings.push({
      rowIndex,
      kind,
      isin,
      securityName: name,
      weightPct: serializePct(weight),
      quantity: qty === null ? null : serializeQuantity(qty),
      marketValue: moneyOrNull(marketValue),
      sector,
      marketCapBucket,
      issuer,
      creditRating,
      maturityDate,
      ytmPct: ytm === null ? null : serializePct(ytm),
    });
  }

  return { asOf, holdings, rowFailures, warnings, headerFound: true };
}

/**
 * `cashPct` is computed from the rows we classified, NOT read off the AMC's own
 * "Cash & Cash Equivalents" line.
 *
 * Those lines are inconsistently defined — some AMCs include net receivables,
 * some exclude them, some report the figure net of margin posted against
 * derivatives. Recomputing from `kind === 'CASH'` gives one definition across
 * every fund, which is the only way `cashPct` is comparable between two funds
 * from different AMCs — and comparing funds is the entire point of the metric.
 */
export function computeCashPct(holdings: readonly ParsedHoldingRow[]): Pct {
  let sum = new Decimal(0);
  for (const h of holdings) {
    if (h.kind === 'CASH') sum = sum.plus(h.weightPct);
  }
  return serializePct(sum);
}

/**
 * Canonical, order-stable serialisation of a holdings list, for the source
 * hash. Sorted so a workbook whose rows are re-ordered but otherwise identical
 * hashes the same — an AMC re-exporting the same month must not create a second
 * snapshot.
 */
export function canonicalHoldingsPayload(holdings: readonly ParsedHoldingRow[]): string {
  return holdings
    .map((h) => `${h.isin ?? h.securityName}|${h.kind}|${h.weightPct}`)
    .sort()
    .join('\n');
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Turn a walk into a validated `PortfolioRaw`, or into the typed failure that
 * `01 §6` prescribes.
 *
 * Every AMC parser ends here, which is what guarantees the 97–103% check is
 * applied identically to all of them. A per-AMC copy of this would be one
 * `if` away from a fund whose snapshot is stored despite failing the check —
 * and nothing downstream re-checks, because the check is defined as an
 * ingest-time gate.
 */
export function assemblePortfolio(
  input: PortfolioParseInput,
  spec: AmcTableSpec,
  ids: { adapterId: string; adapterVersion: string },
): MfFactsheetResult<PortfolioRaw> {
  const walk = walkHoldingsTable(input, spec);

  if (!walk.headerFound) {
    return factsheetFail(
      'MALFORMED_INPUT',
      `No ${spec.amcCode} portfolio header row found; the input does not look like ` +
        'a monthly portfolio disclosure for this AMC.',
      { rowCount: input.rows.length },
    );
  }

  if (walk.holdings.length === 0) {
    return factsheetFail(
      'NO_HOLDINGS',
      `Header found but no holding rows parsed (${walk.rowFailures.length} row failures). ` +
        'Most likely a truncated export.',
      { rowFailures: walk.rowFailures },
    );
  }

  if (walk.asOf === null) {
    return factsheetFail(
      'MALFORMED_INPUT',
      'Could not determine the disclosure as-of date and the caller supplied none. ' +
        'Storing a snapshot under a guessed month would corrupt every time series ' +
        'built from it.',
    );
  }

  const validation = validateSnapshot(walk.holdings);
  if (!validation.ok) {
    const first = validation.failures[0];
    return factsheetFail(
      first?.reason === 'no_holdings' ? 'NO_HOLDINGS' : 'WEIGHTS_SUM',
      first?.detail ?? 'Snapshot validation failed.',
      { weightSumPct: validation.weightSumPct, rowFailures: walk.rowFailures },
    );
  }

  const sourceHash = computeFactsheetSourceHash({
    adapterId: ids.adapterId,
    adapterVersion: ids.adapterVersion,
    schemeCode: input.schemeCode,
    asOf: walk.asOf.toISOString().slice(0, 10),
    payload: canonicalHoldingsPayload(walk.holdings),
  });

  return factsheetOk(
    {
      schemeCode: input.schemeCode,
      amcCode: spec.amcCode,
      asOf: walk.asOf,
      // Every parsed row, cash lines included. `02 §7`'s `numHoldings` filters
      // by kind itself; storing a pre-filtered count here would mean the stored
      // total silently disagreed with `holdings.length`.
      totalHoldings: walk.holdings.length,
      cashPct: computeCashPct(walk.holdings),
      holdings: walk.holdings,
      rowFailures: walk.rowFailures,
      notes: walk.warnings,
      sourceAdapter: ids.adapterId,
      sourceAdapterVer: ids.adapterVersion,
      sourceHash,
    },
    walk.warnings,
  );
}
