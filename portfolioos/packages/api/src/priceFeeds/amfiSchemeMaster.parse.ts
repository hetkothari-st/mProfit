/**
 * AMFI scheme-master parser (`docs/mf-analytics/01-DATA-FOUNDATION.md §3`,
 * `07-IMPLEMENTATION-PLAN.md` Task 1.2).
 *
 * PURE. No Prisma, no network, no filesystem — only node stdlib and
 * `@portfolioos/shared`. The side-effecting half (fetch, upsert `MfSchemeMeta`,
 * write `IngestionFailure`) lives in the job layer, per the `.parse.ts` /
 * `.v1.ts` split in `CONTEXT.md §14`.
 *
 * ---------------------------------------------------------------------------
 * What the input looks like
 * ---------------------------------------------------------------------------
 *
 * AMFI's `NAVAll.txt` is not a CSV. It is a semicolon-delimited body with two
 * kinds of *stateful header line* interleaved between blocks of scheme rows:
 *
 *   Open Ended Schemes(Equity Scheme - Large Cap Fund)   <- category header
 *                                                        (blank line)
 *   Aditya Birla Sun Life Mutual Fund                    <- AMC header
 *   Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
 *   119551;INF209K01YM2;INF209K01YN0;ABSL ... - DIRECT - IDCW;100.5;31-Dec-2025
 *   119552;INF209K01YP5;;ABSL ... - DIRECT - Growth;431.25;31-Dec-2025
 *
 *   HDFC Mutual Fund                                     <- AMC changes,
 *   Scheme Code;...                                         category persists
 *   ...
 *
 *   Open Ended Schemes(Debt Scheme - Liquid Fund)        <- category changes
 *   Aditya Birla Sun Life Mutual Fund
 *   ...
 *
 * Neither the category nor the AMC appears on the scheme row itself. Both are
 * parser state carried down from the last header seen. Getting that state
 * wrong is the single most likely bug in this file: it does not throw, it does
 * not look wrong in the output, it just silently files a large-cap fund into
 * the liquid-fund peer universe and produces a confidently wrong rating.
 * `amfiSchemeMaster.parse.test.ts` pins the behaviour with a fixture that has
 * multiple categories *and* multiple AMCs in a deliberately interleaved order.
 *
 * ---------------------------------------------------------------------------
 * What comes out
 * ---------------------------------------------------------------------------
 *
 * `{ schemes, failures }`. Nothing is ever thrown for a bad row and nothing is
 * ever dropped silently (`CONTEXT.md §3.5`, `01 §5`): a row we cannot use is
 * returned in `failures` with a machine-readable reason so the job can write
 * an `IngestionFailure`.
 *
 * One row can appear in *both* arrays, and that is deliberate — `01 §3` says an
 * unresolvable category text produces an `IngestionFailure(unmapped_sebi_category)`
 * *and* a stored scheme with `sebiSubCategory: 'UNMAPPED'` which is then
 * excluded from every peer universe. So:
 *
 *   | reason                    | in `schemes`?              | in `failures`? |
 *   |---------------------------|----------------------------|----------------|
 *   | unmapped_sebi_category    | yes, marked `UNMAPPED`     | yes            |
 *   | unparseable_plan_option   | no (excluded, `01 §3`)     | yes            |
 *   | malformed_row             | no                         | yes            |
 */

import { createHash } from 'node:crypto';
import {
  resolveSubCategory,
  specFor,
  UNMAPPED_SUBCATEGORY,
  serializeMoney,
  toDecimal,
  type SebiCategory,
  type SebiSubCategory,
  type MfPlanType,
  type MfOptionType,
  type Money,
} from '@portfolioos/shared';

/**
 * Adapter identity, stamped on everything this parser produces
 * (`CONTEXT.md §3.4` — a format change is a new version, not an edit to a
 * tested file). Also mixed into the source hash so a parser change forces a
 * re-upsert rather than silently leaving stale rows in place.
 */
export const AMFI_SCHEME_MASTER_ADAPTER_ID = 'amfi.schemeMaster';
export const AMFI_SCHEME_MASTER_ADAPTER_VERSION = '1';

export type SchemeParseFailureReason =
  | 'unmapped_sebi_category'
  | 'unparseable_plan_option'
  | 'malformed_row';

export interface SchemeParseFailure {
  /** 1-based line number in the source file, for the DLQ's `sourceRef`. */
  line: number;
  raw: string;
  reason: SchemeParseFailureReason;
  /** Human-readable detail; the reason is what code branches on. */
  detail?: string;
}

export interface ParsedSchemeRow {
  schemeCode: string;
  /**
   * AMFI's second column is `ISIN Div Payout/ISIN Growth` — one column doing
   * double duty depending on the option. For a GROWTH row it is the growth
   * ISIN; for an IDCW-payout row it is the payout ISIN.
   */
  isinPayoutOrGrowth: string | null;
  /** AMFI's third column, populated only for reinvestment options. */
  isinReinvest: string | null;
  /**
   * The ISIN that actually identifies *this* plan/option row — the reinvest
   * ISIN for an IDCW_REINVEST row, otherwise the payout/growth column.
   * `MfSchemeMeta.isin` is `@unique`, so it must be the per-row one.
   */
  isin: string | null;
  schemeName: string;
  amcName: string;

  /** Verbatim category header line the row sat under; kept for debugging. */
  categoryHeaderText: string;
  sebiCategory: SebiCategory;
  sebiSubCategory: SebiSubCategory | typeof UNMAPPED;

  planType: MfPlanType;
  optionType: MfOptionType;
  /**
   * Exchange-traded fund. Recorded rather than re-derived downstream because
   * `03-SCORING.md §5` scores an ETF's STRUCTURE pillar on bid-ask / iNAV
   * deviation and an index fund's on cash drag, and AMFI files both under the
   * same "Index Funds/ETFs" sub-category — the sub-category alone cannot
   * separate them.
   */
  isEtf: boolean;

  /** `null` where AMFI publishes `N.A.` (new scheme, or non-NAV day). */
  nav: Money | null;
  /** UTC midnight of AMFI's `DD-MMM-YYYY` date; `null` if unparseable. */
  navDate: Date | null;

  /** Normalised scheme name with the plan/option suffix stripped (`03 §1`). */
  growthSiblingKey: string;
  /** Populated by `linkGrowthSiblings`; always `null` on a GROWTH row. */
  growthSiblingSchemeCode: string | null;

  sourceHash: string;
  sourceAdapter: string;
  sourceAdapterVer: string;
  /** 1-based line number this row was read from. */
  line: number;
}

export interface AmfiMasterParseResult {
  schemes: ParsedSchemeRow[];
  failures: SchemeParseFailure[];
}

/**
 * Alias for the shared sentinel so the type annotations below read cleanly.
 * The *value* is `UNMAPPED_SUBCATEGORY` from `@portfolioos/shared` — this file
 * does not define its own, because `MfSchemeMetaDto.sebiSubCategory` and the
 * universe-membership filter in `03 §1` both test against that one constant.
 */
const UNMAPPED = UNMAPPED_SUBCATEGORY;
type UNMAPPED = typeof UNMAPPED_SUBCATEGORY;

// ---------------------------------------------------------------------------
// 1. Category resolution
// ---------------------------------------------------------------------------

export interface ResolvedSchemeCategory {
  sebiCategory: SebiCategory;
  sebiSubCategory: SebiSubCategory | UNMAPPED;
}

/**
 * AMFI wraps the useful part in parentheses:
 * `Open Ended Schemes(Equity Scheme - Large Cap Fund)`. The outer words
 * ("Open Ended Schemes") describe the *structure* of the scheme, not its SEBI
 * category, and `normaliseCategoryText` in `@portfolioos/shared` only knows how
 * to strip the inner `"<Broad> Scheme - "` prefix — so the parenthesised part
 * has to be extracted here first.
 */
function extractCategoryPayload(headerText: string): string {
  const open = headerText.indexOf('(');
  const close = headerText.lastIndexOf(')');
  if (open >= 0 && close > open) return headerText.slice(open + 1, close).trim();
  // Some historical files list a bare category with no parentheses.
  return headerText.trim();
}

/**
 * The broad category is stated in the header prefix ("Equity Scheme - ..."),
 * so for an UNMAPPED sub-category we can still record the broad one from what
 * AMFI literally wrote rather than defaulting everything to OTHER. This is not
 * a guess: it is the other half of the same string.
 */
const BROAD_CATEGORY_PREFIX: ReadonlyArray<[RegExp, SebiCategory]> = [
  [/^\s*equity\s+schemes?\b/i, 'EQUITY'],
  [/^\s*debt\s+schemes?\b/i, 'DEBT'],
  [/^\s*hybrid\s+schemes?\b/i, 'HYBRID'],
  [/^\s*solution\s+oriented\s+schemes?\b/i, 'SOLUTION_ORIENTED'],
  [/^\s*other\s+scheme\b/i, 'OTHER'],
];

/**
 * Thin wrapper over the shared `resolveSubCategory` — the SEBI mapping lives in
 * exactly one place (`packages/shared/src/sebiCategories.ts`) and is not
 * reimplemented here.
 */
export function resolveSchemeCategory(categoryHeaderText: string): ResolvedSchemeCategory {
  const payload = extractCategoryPayload(categoryHeaderText);
  const sub = resolveSubCategory(payload);
  if (sub) return { sebiCategory: specFor(sub).sebiCategory, sebiSubCategory: sub };

  for (const [re, broad] of BROAD_CATEGORY_PREFIX) {
    if (re.test(payload)) return { sebiCategory: broad, sebiSubCategory: UNMAPPED };
  }
  return { sebiCategory: 'OTHER', sebiSubCategory: UNMAPPED };
}

// ---------------------------------------------------------------------------
// 2. Plan / option parsing
// ---------------------------------------------------------------------------

/**
 * Scheme-name suffixes are the messiest part of the whole feed. AMCs have never
 * agreed a format and AMFI passes the name through verbatim, so the same
 * concept arrives as `Direct Plan - Growth`, `- DIRECT - Growth`,
 * `Direct Growth`, `- Growth Option - Direct Plan` and `(G)`, sometimes inside
 * one AMC's own list.
 *
 * Two vocabulary notes that make the regexes below make sense:
 *
 *  - **IDCW == Dividend.** SEBI renamed "Dividend" to "Income Distribution cum
 *    Capital Withdrawal" in 2021. Both spellings, the acronym, the abbreviation
 *    `Div`, and the full expanded phrase are all live in the current file
 *    because AMCs renamed at different times and some never renamed at all.
 *  - **Regular is the default.** AMFI's convention is that a scheme with no
 *    plan marker is the regular (distributor) plan; the direct plan, introduced
 *    in 2013, is the one that always carries an explicit marker. So a bare name
 *    means REGULAR — it does *not* mean "unknown".
 */

/** `\bdirect\b` / `\bregular\b`. Anchored on word boundaries so a fund with
 *  "Regular Savings" in its *name* is still matched on the right token — that
 *  name resolves to REGULAR anyway, which is the same answer the default gives. */
const RE_DIRECT = /\bdirect\b/i;
const RE_REGULAR = /\bregular\b/i;

/** Growth. `(G)` is the common short form; `- G` appears as a trailing token. */
const RE_GROWTH = /\bgrowth\b|\(\s*g\s*\)|[-–]\s*g\s*$/i;

/**
 * IDCW in all its spellings. `\bdiv\b` catches "Div - Payout"; the expanded
 * SEBI phrase catches "Payout of Income Distribution cum capital Withdrawal".
 */
// `DCW` (no leading I) occurs in the live file -- e.g. "MONTHLY DCW Payout".
// It is an AMC typo for IDCW that AMFI passes through verbatim.
const RE_IDCW = /\bi?dcw\b|\bdividend\b|\bdiv\b|income\s+distribution\s+cum|\(\s*d\s*\)/i;

const RE_REINVEST = /re-?\s?invest(ment)?\b|\breinv\b|\(\s*(idcw\s*-\s*)?r(i|einv(est)?)?\s*\)/i;
const RE_PAYOUT = /\bpay-?\s?out\b|\(\s*(idcw\s*-\s*)?p\s*\)/i;

/**
 * Index of the last match of `re` in `text`, or -1. The source regexes are
 * declared without `/g` (they are also used with `.test`), so a fresh global
 * copy is made here — a shared `/g` regex carries `lastIndex` between calls and
 * would make results depend on call order.
 */
function lastMatchIndex(text: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let last = -1;
  for (let m = g.exec(text); m !== null; m = g.exec(text)) {
    last = m.index;
    if (m[0].length === 0) g.lastIndex += 1; // guard against a zero-width match
  }
  return last;
}

export interface PlanAndOption {
  planType: MfPlanType;
  optionType: MfOptionType;
}

/**
 * Exchange-traded funds, by name.
 *
 * `BeES` is Benchmark Asset Management's original ETF brand, inherited by
 * Nippon India and still carried by several of the largest ETFs in the country
 * ("Nifty 50 BeES", "Bank BeES", "Gold BeES"), none of which contain the
 * string "ETF" anywhere in the name. Matching only on "ETF" would drop them.
 *
 * `\bETF\b` rather than a bare substring so that a fund whose name merely
 * contains the letters (there are none today, but "…ETFund…" style branding is
 * cheap to guard against) does not match.
 */
const RE_ETF = /\bETF\b|\bBeES\b|\bExchange[- ]Traded\b/i;

/**
 * True when the scheme is an exchange-traded fund rather than a conventional
 * open-ended scheme.
 *
 * The distinction is not cosmetic: `03-SCORING.md §5` gives the INDEX model a
 * `STRUCTURE` pillar that scores an ETF on bid-ask spread / iNAV deviation and
 * an index *fund* on its cash drag. The scorer cannot tell them apart from the
 * sub-category alone — AMFI files both under "Index Funds/ETFs" — so the
 * parser has to say which it saw.
 */
export function isEtfName(schemeName: string): boolean {
  return RE_ETF.test(schemeName);
}

/**
 * Returns `null` only when the *option* genuinely cannot be determined — the
 * name carries no growth marker and no IDCW marker at all. `01 §3` requires
 * those rows to become an `IngestionFailure` and be excluded rather than
 * guessed into a bucket.
 *
 * **ETFs are the one principled exception.** "Nippon India ETF Nifty 50 BeES"
 * carries no plan or option suffix because an ETF *has* no plan or option: it
 * is a single listed class of units, bought on exchange, with no distributor
 * trail and therefore no Direct/Regular split, and no IDCW variant to choose
 * between. Returning `null` here would not be honesty about an ambiguous name,
 * it would be discarding an unambiguous one — and since `03 §2` routes the
 * whole "Index Funds/ETFs" sub-category to the INDEX scoring model, dropping
 * every ETF would leave that model with an empty universe and no fund in it
 * ever rated.
 *
 * They are reported as DIRECT/GROWTH, which is the economically accurate
 * reading rather than a convenient default: with no trail commission an ETF's
 * expense ratio is comparable to a direct plan's, which is exactly the
 * comparison `universeKey` exists to make. An ETF that does carry an explicit
 * suffix (rare, but some gold ETFs historically did) still has it honoured —
 * the suffix is evidence and beats the structural inference.
 */
/**
 * AMFI's own `Plan` column. Values seen in the live file: "Direct Plan",
 * "Regular Plan", and blank.
 */
export function parsePlanColumn(raw: string | undefined): MfPlanType | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (v.length === 0) return null;
  if (v.includes('direct')) return 'DIRECT';
  if (v.includes('regular')) return 'REGULAR';
  return null;
}

/**
 * AMFI's own `Option` column. The live file carries at least: "Growth",
 * "Growth Option", "GROWTH", "IDCW", "IDCW Option", "Monthly IDCW",
 * "Quarterly IDCW", "Weekly IDCW", "Daily IDCW", "Annual IDCW",
 * "IDCW (Income Distribution CUM Capital Withdrawal)", and blank.
 *
 * Payout vs reinvestment is NOT in this column -- AMFI states the frequency,
 * not the mode -- so an IDCW here resolves the same way an unqualified IDCW in
 * the name does (payout; see the note on `parsePlanAndOption`), unless the
 * name says reinvestment. The caller passes the name in for exactly that.
 */
export function parseOptionColumn(
  raw: string | undefined,
  schemeName: string,
): MfOptionType | null {
  const v = (raw ?? '').trim();
  if (v.length === 0) return null;
  if (RE_IDCW.test(v)) {
    if (RE_REINVEST.test(v) || RE_REINVEST.test(schemeName)) return 'IDCW_REINVEST';
    if (RE_PAYOUT.test(v) || RE_PAYOUT.test(schemeName)) return 'IDCW_PAYOUT';
    return 'IDCW_PAYOUT';
  }
  if (RE_GROWTH.test(v)) return 'GROWTH';
  return null;
}

/**
 * Plan and option for a row, preferring AMFI's explicit columns and falling
 * back to the scheme name.
 *
 * The live `NAVAll.txt` has EIGHT columns and states Plan and Option outright
 * -- but leaves both blank on roughly 40% of rows (5,756 of 14,339 in the
 * September 2026 file). So neither source alone is sufficient: the columns are
 * authoritative where present, and the name heuristic below covers the rest.
 * Reading the name when AMFI has already told us is how "Nippon India Growth
 * Fund - Direct - IDCW" gets mis-filed.
 */
export function resolvePlanAndOption(
  planCol: string | undefined,
  optionCol: string | undefined,
  schemeName: string,
): PlanAndOption | null {
  const fromName = parsePlanAndOption(schemeName);
  const planType = parsePlanColumn(planCol) ?? fromName?.planType ?? null;
  const optionType = parseOptionColumn(optionCol, schemeName) ?? fromName?.optionType ?? null;
  if (optionType === null) return null;
  // AMFI's convention: no plan marker anywhere means the regular plan.
  return { planType: planType ?? 'REGULAR', optionType };
}

export function parsePlanAndOption(schemeName: string): PlanAndOption | null {
  const name = schemeName.replace(/\s+/g, ' ').trim();

  // REGULAR is the default, not a fallback for "unknown" — see the block
  // comment above. An explicit "Direct" always wins over a stray "Regular"
  // occurring in the fund's own name (e.g. "Regular Savings Fund - Direct").
  const planType: MfPlanType = RE_DIRECT.test(name)
    ? 'DIRECT'
    : RE_REGULAR.test(name)
      ? 'REGULAR'
      : 'REGULAR';

  /**
   * Last marker wins, rather than "IDCW beats Growth" or vice versa.
   *
   * This is not over-engineering, it is the fix for a whole family of real
   * misclassifications caused by option keywords appearing in the *fund's own
   * name*, before the suffix:
   *
   *   "Aditya Birla Sun Life Dividend Yield Fund - Direct Plan - Growth"
   *        ^ Dividend Yield Fund is a SEBI sub-category, not an option
   *
   * A naive `if (hasIdcw)` files every scheme in that entire sub-category as
   * IDCW. Symmetrically, "Nippon India Growth Fund - Direct - IDCW" would be
   * filed as GROWTH by a naive `if (hasGrowth)`. Both names resolve correctly
   * once we ask which marker appears *last*, because AMFI always puts the
   * option at the end of the name.
   *
   * Residual known limitation: a name whose base contains "Growth" and which
   * carries no option suffix at all ("HDFC Growth Opportunities Fund") is
   * read as GROWTH. Such names are rare in the AMFI file and the alternative —
   * treating them as unparseable — throws away a real scheme.
   */
  const idcwAt = lastMatchIndex(name, RE_IDCW);
  const growthAt = lastMatchIndex(name, RE_GROWTH);
  const hasIdcw = idcwAt >= 0 && idcwAt > growthAt;
  const hasGrowth = growthAt >= 0 && growthAt > idcwAt;

  if (hasIdcw) {
    if (RE_REINVEST.test(name)) return { planType, optionType: 'IDCW_REINVEST' };
    if (RE_PAYOUT.test(name)) return { planType, optionType: 'IDCW_PAYOUT' };
    /**
     * IDCW with neither marker → IDCW_PAYOUT. Two independent reasons:
     *
     *  1. AMFI's own column layout says so. `NAVAll.txt` column 2 is
     *     "ISIN Div Payout/ISIN Growth" and column 3 is "ISIN Div Reinvestment".
     *     An unqualified IDCW row carries its ISIN in column 2 — i.e. AMFI is
     *     already treating it as the payout variant. A reinvestment option
     *     essentially always says so, because it needs the separate ISIN.
     *  2. Payout is the conservative error. If we are wrong, we have understated
     *     the investor's reinvested units; guessing REINVEST would fabricate
     *     units that were never bought.
     */
    return { planType, optionType: 'IDCW_PAYOUT' };
  }

  if (hasGrowth) return { planType, optionType: 'GROWTH' };

  // No option marker. For an ETF that is structural, not missing information —
  // see the block comment above. `planType` is forced to DIRECT rather than
  // reusing the computed value, because the REGULAR default at the top of this
  // function encodes "no Direct marker means Regular", which is a statement
  // about conventional schemes and is simply false for a listed one.
  if (isEtfName(name)) return { planType: 'DIRECT', optionType: 'GROWTH' };

  // Neither marker present, and not an ETF. Honest answer is "don't know"
  // (`01 §3`).
  return null;
}

// ---------------------------------------------------------------------------
// 3. Growth-sibling key
// ---------------------------------------------------------------------------

/**
 * Tokens that only ever describe the plan or the option, never the fund. Any
 * *trailing* hyphen-delimited segment made entirely of these is suffix, not
 * name, and is stripped to produce the sibling key.
 *
 * Payout frequencies ("Daily", "Weekly", "Monthly") are included on purpose:
 * a Daily IDCW and a Monthly IDCW of the same scheme share one portfolio and
 * therefore one growth sibling (`03 §1`).
 */
const SUFFIX_TOKENS = new Set([
  'direct',
  'regular',
  'plan',
  'option',
  'opt',
  'growth',
  'idcw',
  'dividend',
  'div',
  'payout',
  'pay',
  'out',
  'reinvestment',
  'reinvest',
  'reinvested',
  'reinv',
  'ri',
  // "Daily Dividend Re-investment" splits on its own internal hyphen into
  // "…Re" + "investment", so both halves have to be recognised as suffix.
  're',
  'investment',
  'inv',
  'income',
  'distribution',
  'cum',
  'capital',
  'withdrawal',
  'of',
  'and',
  'daily',
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'annual',
  'annually',
  'yearly',
  'half',
  'g',
  'd',
  'p',
  'r',
]);

/** Strip `(G)`, `(IDCW-R)`, `(Div - Payout)` … from the tail of a segment. */
function stripTrailingParenthetical(text: string): string {
  return text.replace(/\s*\([^()]*\)\s*$/, '').trim();
}

function isSuffixSegment(segment: string): boolean {
  const words = stripTrailingParenthetical(segment)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  // An empty segment (e.g. a bare "(G)") is suffix. A segment with a single
  // non-suffix word ("Fund") is not.
  if (words.length === 0) return true;
  return words.every((w) => SUFFIX_TOKENS.has(w));
}

/**
 * The key an IDCW row is matched to its GROWTH sibling by (`03 §1`): the
 * scheme name with every trailing plan/option segment removed, lowercased and
 * whitespace-collapsed.
 *
 * Deliberately aggressive about punctuation (`&` → `and`, everything else
 * dropped) because the match is only ever made *within* one AMC and one plan
 * type — the risk of a false collision across two genuinely different funds of
 * the same AMC is far lower than the risk of a missed match from "Banking &
 * PSU" vs "Banking and PSU".
 */
export function growthSiblingKey(schemeName: string): string {
  const segments = schemeName.split(/\s[-–—]\s|[-–—]/).map((s) => s.trim());

  // Walk backwards dropping suffix segments. Stop at the first real one, so a
  // hyphen inside the fund's own name ("Nifty 50 - Index Fund") survives.
  let end = segments.length;
  while (end > 1 && isSuffixSegment(segments[end - 1] ?? '')) end -= 1;

  const base = stripTrailingParenthetical(segments.slice(0, end).join(' '));

  return base
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function siblingMapKey(amcName: string, planType: MfPlanType, key: string): string {
  return `${amcName.trim().toLowerCase()}|${planType}|${key}`;
}

/**
 * Populates `growthSiblingSchemeCode` on every non-GROWTH row by matching
 * `(amcName, planType, growthSiblingKey)`.
 *
 * The plan type is part of the key on purpose: a DIRECT IDCW option must
 * resolve to the DIRECT growth option, never the REGULAR one. They are
 * different NAV series (different TER), so crossing them would attribute a
 * distributor-plan return to a direct-plan holder.
 *
 * Returns new row objects; the input array is not mutated.
 */
export function linkGrowthSiblings(rows: readonly ParsedSchemeRow[]): ParsedSchemeRow[] {
  const growthByKey = new Map<string, string>();
  for (const row of rows) {
    if (row.optionType !== 'GROWTH') continue;
    const k = siblingMapKey(row.amcName, row.planType, row.growthSiblingKey);
    const existing = growthByKey.get(k);
    // Two growth rows on one key shouldn't happen, but if AMFI ever ships a
    // duplicate we pick the lower scheme code so the output does not depend on
    // the order rows happened to appear in the file (§3.3 determinism).
    if (existing === undefined || row.schemeCode.localeCompare(existing, 'en', { numeric: true }) < 0) {
      growthByKey.set(k, row.schemeCode);
    }
  }

  return rows.map((row) => {
    if (row.optionType === 'GROWTH') return { ...row, growthSiblingSchemeCode: null };
    const sibling =
      growthByKey.get(siblingMapKey(row.amcName, row.planType, row.growthSiblingKey)) ?? null;
    return { ...row, growthSiblingSchemeCode: sibling };
  });
}

// ---------------------------------------------------------------------------
// 4. Source hash
// ---------------------------------------------------------------------------

/** Fields the hash is taken over. Public so a test can assert the contract. */
export type SchemeHashInput = Pick<
  ParsedSchemeRow,
  | 'schemeCode'
  | 'isin'
  | 'isinPayoutOrGrowth'
  | 'isinReinvest'
  | 'schemeName'
  | 'amcName'
  | 'sebiCategory'
  | 'sebiSubCategory'
  | 'planType'
  | 'optionType'
>;

/**
 * Deterministic identity hash for a scheme-master row (`CONTEXT.md §3.3`).
 *
 * NAV and NAV date are **excluded**. They change every business day, and this
 * hash guards the *metadata* upsert: including them would make every daily run
 * look like a metadata change and rewrite all ~12,000 `MfSchemeMeta` rows
 * nightly, defeating the "second run is a no-op" requirement of Task 1.2. NAV
 * values have their own idempotency key on `MfNav`.
 *
 * A NUL byte is the separator because it cannot occur in any of the fields, so
 * no combination of values can be made to collide by shifting a delimiter.
 */
export function computeSchemeSourceHash(row: SchemeHashInput): string {
  const parts = [
    AMFI_SCHEME_MASTER_ADAPTER_ID,
    AMFI_SCHEME_MASTER_ADAPTER_VERSION,
    row.schemeCode,
    row.isin ?? '',
    row.isinPayoutOrGrowth ?? '',
    row.isinReinvest ?? '',
    row.schemeName,
    row.amcName,
    row.sebiCategory,
    row.sebiSubCategory,
    row.planType,
    row.optionType,
  ];
  return createHash('sha256').update(parts.join('\u0000'), 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// 5. Row-level primitives
// ---------------------------------------------------------------------------

const MONTHS: Readonly<Record<string, number>> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * AMFI dates are `DD-MMM-YYYY` in IST with no time component. We build a UTC
 * midnight `Date` so the value round-trips through Postgres `@db.Date` without
 * the day sliding backwards for a server west of UTC (`CONTEXT.md §14.2`).
 */
export function parseAmfiDate(raw: string): Date | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const [, dd, mon, yyyy] = m;
  const monthIndex = MONTHS[(mon ?? '').toLowerCase()];
  if (monthIndex === undefined) return null;
  // Non-monetary integers: the explicit `Number.parseInt` form is the one the
  // no-money-coercion rule permits.
  const day = Number.parseInt(dd ?? '', 10);
  const year = Number.parseInt(yyyy ?? '', 10);
  if (!Number.isFinite(day) || !Number.isFinite(year)) return null;
  const d = new Date(Date.UTC(year, monthIndex, day));
  // Rejects 31-Feb-2025 and friends, which JS would silently roll forward.
  if (d.getUTCDate() !== day || d.getUTCMonth() !== monthIndex) return null;
  return d;
}

/** Only a plain decimal is accepted; `N.A.`, `-` and blanks become `null`. */
const RE_NAV = /^-?\d+(\.\d+)?$/;

function parseNav(raw: string): Money | null {
  const t = raw.trim();
  if (!t || !RE_NAV.test(t)) return null;
  // Money never touches `Number`; `toDecimal` then `serializeMoney` fixes it at
  // the Decimal(18,4) precision the column uses (§3.1).
  return serializeMoney(toDecimal(t));
}

function nullIfBlank(raw: string | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t || t === '-' || t.toUpperCase() === 'N.A.' || t.toUpperCase() === 'NA') return null;
  return t;
}

// ---------------------------------------------------------------------------
// 6. Header classification
// ---------------------------------------------------------------------------

/**
 * A category header is a semicolon-free line naming the scheme structure.
 * Everything else semicolon-free is taken to be an AMC name — matching on
 * "Mutual Fund" would be tighter but silently drops the handful of AMCs whose
 * listed name omits it, and a dropped AMC means every one of its schemes is
 * mis-attributed to the AMC above.
 */
const RE_CATEGORY_HEADER = /^(open|close|closed|interval)\b/i;

/** The repeated column header inside each block. */
const RE_COLUMN_HEADER = /^scheme\s*code\s*;/i;

// ---------------------------------------------------------------------------
// 7. The parser
// ---------------------------------------------------------------------------

export function parseAmfiNavAll(text: string): AmfiMasterParseResult {
  const schemes: ParsedSchemeRow[] = [];
  const failures: SchemeParseFailure[] = [];

  // The two pieces of carried state. See the file header comment.
  let currentCategoryHeader: string | null = null;
  let currentCategory: ResolvedSchemeCategory | null = null;
  let currentAmc: string | null = null;

  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    const lineNo = i + 1;

    if (!line) continue;
    if (RE_COLUMN_HEADER.test(line)) continue;

    if (!line.includes(';')) {
      if (RE_CATEGORY_HEADER.test(line)) {
        currentCategoryHeader = line;
        currentCategory = resolveSchemeCategory(line);
        /**
         * Reset the AMC on a category change. In every real file an AMC header
         * immediately follows the category header, so this costs nothing; what
         * it buys is that if AMFI ever omits it, the rows surface as
         * `malformed_row` in the DLQ instead of silently inheriting the AMC of
         * the *previous category's last block* — a wrong AMC corrupts sibling
         * linking and AMC-concentration analysis with no visible symptom.
         */
        currentAmc = null;
      } else {
        currentAmc = line;
      }
      continue;
    }

    const parts = line.split(';');
    const schemeCode = (parts[0] ?? '').trim();

    if (parts.length < 6 || !/^\d+$/.test(schemeCode)) {
      failures.push({
        line: lineNo,
        raw: line,
        reason: 'malformed_row',
        detail:
          parts.length < 6
            ? `expected 6 semicolon-delimited fields, got ${parts.length}`
            : `scheme code is not numeric: ${JSON.stringify(schemeCode)}`,
      });
      continue;
    }

    const schemeName = (parts[3] ?? '').trim();
    if (!schemeName) {
      failures.push({ line: lineNo, raw: line, reason: 'malformed_row', detail: 'empty scheme name' });
      continue;
    }

    if (!currentCategory || !currentCategoryHeader) {
      failures.push({
        line: lineNo,
        raw: line,
        reason: 'malformed_row',
        detail: 'scheme row appeared before any category header',
      });
      continue;
    }

    if (!currentAmc) {
      failures.push({
        line: lineNo,
        raw: line,
        reason: 'malformed_row',
        detail: 'scheme row appeared before any AMC header',
      });
      continue;
    }

    /**
     * Column layout, decided per row rather than per file.
     *
     * The live AMFI file is EIGHT columns:
     *   code;isinGrowth;isinReinvest;name;plan;option;nav;date
     * Archived and third-party mirrors of the same feed are SIX, folding plan
     * and option into the name:
     *   code;isinGrowth;isinReinvest;name;nav;date
     * Both are supported because the historical downloads used for a backfill
     * are not guaranteed to match today's live shape, and a backfill that
     * silently dropped every row would look like "no history exists".
     */
    const isEightColumn = parts.length >= 8;
    const planCol = isEightColumn ? parts[4] : undefined;
    const optionCol = isEightColumn ? parts[5] : undefined;
    const navRaw = isEightColumn ? parts[6] : parts[4];
    const dateRaw = isEightColumn ? parts[7] : parts[5];

    const planOption = resolvePlanAndOption(planCol, optionCol, schemeName);
    if (!planOption) {
      // Excluded entirely, per `01 §3`.
      failures.push({
        line: lineNo,
        raw: line,
        reason: 'unparseable_plan_option',
        detail: `no growth or IDCW marker in ${JSON.stringify(schemeName)}`,
      });
      continue;
    }

    if (currentCategory.sebiSubCategory === UNMAPPED) {
      // Recorded *and* kept — see the table in the file header comment.
      failures.push({
        line: lineNo,
        raw: line,
        reason: 'unmapped_sebi_category',
        detail: `no SEBI sub-category for ${JSON.stringify(currentCategoryHeader)}`,
      });
    }

    const isinPayoutOrGrowth = nullIfBlank(parts[1]);
    const isinReinvest = nullIfBlank(parts[2]);
    const isin =
      planOption.optionType === 'IDCW_REINVEST'
        ? (isinReinvest ?? isinPayoutOrGrowth)
        : isinPayoutOrGrowth;

    const base = {
      schemeCode,
      isinPayoutOrGrowth,
      isinReinvest,
      isin,
      schemeName,
      amcName: currentAmc,
      categoryHeaderText: currentCategoryHeader,
      sebiCategory: currentCategory.sebiCategory,
      sebiSubCategory: currentCategory.sebiSubCategory,
      planType: planOption.planType,
      optionType: planOption.optionType,
      isEtf: isEtfName(schemeName),
      nav: parseNav(navRaw ?? ''),
      navDate: parseAmfiDate(dateRaw ?? ''),
      growthSiblingKey: growthSiblingKey(schemeName),
      growthSiblingSchemeCode: null,
      sourceAdapter: AMFI_SCHEME_MASTER_ADAPTER_ID,
      sourceAdapterVer: AMFI_SCHEME_MASTER_ADAPTER_VERSION,
      line: lineNo,
    };

    schemes.push({ ...base, sourceHash: computeSchemeSourceHash(base) });
  }

  return { schemes: linkGrowthSiblings(schemes), failures };
}
