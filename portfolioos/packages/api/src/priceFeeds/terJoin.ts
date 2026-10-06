/**
 * Deciding which of our schemes a TER row belongs to.
 *
 * AMFI's TER workbook carries an NSDL scheme code, a base scheme name, a type
 * and a category. It carries **no AMFI scheme code and no ISIN**, so there is
 * no exact key at the source and the join has to be made on the name.
 *
 * A name join is only safe if it is unambiguous on both sides, and "96.7% of
 * names matched" does not establish that. Two AMCs can and do use the same
 * product name — "Large Cap Fund", "Nifty 50 Index Fund", "Liquid Fund" are
 * generic — and a name-only join hands one AMC's cost to another AMC's fund.
 * That is worse than a missing TER, because a missing TER is a recorded gap
 * the methodology already handles, while a wrong one is a silent input to a
 * cost-weighted ranking.
 *
 * So a match is accepted only when BOTH hold:
 *
 *   1. **The AMC matches**, against the COMMITTED brand map in
 *      `amcBrandMap.ts`. The TER file has no AMC column, but AMFI writes the
 *      AMC's brand at the front of every scheme name in both files, and that
 *      is the only AMC signal the source gives us. The brands used to be
 *      derived at runtime; they are now generated once, committed and
 *      reviewed, because a runtime derivation changes its answer when a fund
 *      house launches an oddly-named scheme and silently drops funds that
 *      matched yesterday. An AMC absent from the map is `ter_unmapped_amc` —
 *      never a runtime guess.
 *
 *   2. **The match is one-to-one in the direct-growth population.** That
 *      population is the only one the ranking can recommend from, and within
 *      it a scheme name should be unique. If an (AMC, name) key resolves to
 *      two direct-growth schemes, or if two TER rows claim the same key, the
 *      key is not an identifier and nothing is written.
 *
 * Everything else is a miss, recorded as `ter_unmatched` so the gap has a
 * cause attached rather than being indistinguishable from "AMFI left the cell
 * blank".
 *
 * Pure: no database, no network. The service supplies both sides.
 */

import { normaliseSchemeName } from './amfiTer.parse.js';
import { BRAND_TO_AMC, isMappedAmc } from './amcBrandMap.js';

/** How a scheme's TER join came out on the last refresh. */
export type TerJoinStatus =
  /** One TER row, one scheme, same AMC. */
  | 'MATCHED'
  /** No TER row claimed this scheme. */
  | 'UNMATCHED'
  /**
   * This scheme's AMC is not in the committed brand map, so its TER rows
   * cannot be attributed to it. Distinct from UNMATCHED on purpose: this is
   * OUR gap, fixed by regenerating and reviewing the map, not AMFI's.
   */
  | 'UNMAPPED_AMC'
  /** The key resolved to more than one scheme, or more than one TER row
   *  claimed it. Deliberately distinct from UNMATCHED: this is a name that
   *  is not an identifier, which is a different problem from a missing row. */
  | 'AMBIGUOUS';

export interface JoinScheme {
  schemeCode: string;
  schemeName: string;
  amcName: string;
}

export interface JoinTerRow {
  nameKey: string;
  schemeName: string;
  directTerPct: number | null;
  asOf: Date;
}

export interface TerMatch {
  schemeCode: string;
  /** The name as AMFI publishes it in NAVAll. */
  amfiName: string;
  /** The name as AMFI publishes it in the TER workbook. */
  terName: string;
  amcName: string;
  terPct: number;
  asOf: Date;
}

export interface TerJoinResult {
  matches: TerMatch[];
  /** Direct-growth schemes no TER row claimed. */
  unmatched: JoinScheme[];
  /** Keys that were not identifiers, with why. */
  ambiguous: Array<{ key: string; reason: 'multiple_schemes' | 'multiple_ter_rows'; count: number }>;
  /** TER rows whose name begins with no brand in the committed map. */
  unknownAmc: string[];
  /** Our schemes whose AMC is absent from the committed brand map. */
  unmappedAmc: JoinScheme[];
}

/**
 * "Aditya Birla Sun Life Mutual Fund" → "aditya birla sun life".
 *
 * The trailing "Mutual Fund" is in the AMC name and never in the scheme name,
 * so it has to come off before either can be compared with the other.
 */
export function amcKey(amcName: string): string {
  return normaliseSchemeName(amcName)
    .replace(/\s*mutual fund\s*$/, '')
    .replace(/\s*asset management\s*$/, '')
    .trim();
}

/** Longest common leading word sequence of a set of names. */
function commonWordPrefix(names: string[], maxWords: number): string {
  if (names.length === 0) return '';
  const split = names.map((n) => n.split(' ').filter(Boolean));
  const first = split[0]!;
  const words: string[] = [];
  for (let i = 0; i < Math.min(first.length, maxWords); i++) {
    const w = first[i]!;
    if (!split.every((parts) => parts[i] === w)) break;
    words.push(w);
  }
  return words.join(' ');
}

/**
 * The brand each AMC actually writes at the front of its scheme names.
 *
 * The registered AMC name is often not it. "Kotak Mahindra Mutual Fund" names
 * its schemes "Kotak …"; "Franklin Templeton Mutual Fund" names them
 * "Franklin India …"; "Trust Mutual Fund" names them "TRUSTMF …". Matching on
 * the registered name alone loses every one of those funds, which is a
 * correctness rule turning into a data-loss rule.
 *
 * So each AMC contributes two brands: its registered name, and the longest
 * common leading word sequence of its own scheme names — read from the data
 * rather than from a hand-maintained alias table that would go stale the
 * first time an AMC rebranded.
 *
 * A brand two different AMCs both claim is dropped. That is the case the
 * whole AMC check exists for, and resolving it by picking one would be
 * exactly the guess this refuses to make.
 */
export function deriveAmcBrands(schemes: JoinScheme[]): Map<string, string> {
  const byAmc = new Map<string, string[]>();
  for (const s of schemes) {
    const amc = amcKey(s.amcName);
    const list = byAmc.get(amc);
    if (list) list.push(normaliseSchemeName(s.schemeName));
    else byAmc.set(amc, [normaliseSchemeName(s.schemeName)]);
  }

  // brand → the AMCs claiming it.
  const claims = new Map<string, Set<string>>();
  const claim = (brand: string, amc: string) => {
    if (!brand) return;
    const set = claims.get(brand);
    if (set) set.add(amc);
    else claims.set(brand, new Set([amc]));
  };

  for (const [amc, names] of byAmc) {
    claim(amc, amc);
    // Capped at three words, and only from an AMC with more than one distinct
    // scheme name. With a single scheme the "common prefix" is that scheme's
    // whole name, which is not a brand: it would match exactly one row and
    // tell us nothing, while looking in a committed map like a considered
    // decision.
    const distinct = [...new Set(names)];
    if (distinct.length < 2) continue;
    const derived = commonWordPrefix(distinct, 3);
    if (derived && derived !== amc && !distinct.includes(derived)) claim(derived, amc);
  }

  const brands = new Map<string, string>();
  for (const [brand, amcs] of claims) {
    if (amcs.size === 1) brands.set(brand, [...amcs][0]!);
  }
  return brands;
}

/**
 * Which AMC a TER scheme name belongs to, by brand prefix.
 *
 * The LONGEST matching brand wins, which is specificity rather than
 * ambiguity: if both "bajaj" and "bajaj finserv" were brands, a scheme named
 * "Bajaj Finserv Multi Cap Fund" belongs to the latter.
 */
export function amcForTerName(
  nameKey: string,
  brands: ReadonlyMap<string, string> | Iterable<string>,
): string | null {
  const entries: Array<[string, string]> =
    brands instanceof Map ? [...brands] : [...(brands as Iterable<string>)].map((b) => [b, b]);
  let bestBrand: string | null = null;
  let bestAmc: string | null = null;
  for (const [brand, amc] of entries) {
    if (!brand) continue;
    if (nameKey !== brand && !nameKey.startsWith(`${brand} `)) continue;
    if (bestBrand === null || brand.length > bestBrand.length) {
      bestBrand = brand;
      bestAmc = amc;
    }
  }
  return bestAmc;
}

const joinKey = (amc: string, name: string) => `${amc}::${name}`;

/**
 * Join TER rows to schemes.
 *
 * `schemes` must already be narrowed to the direct-growth population — the
 * one-to-one requirement is defined over it, and passing the whole universe
 * would make every key ambiguous by eight plan/option variants.
 */
export function joinTerToSchemes(
  schemes: JoinScheme[],
  terRows: JoinTerRow[],
  /**
   * Brand → amcKey. Defaults to the COMMITTED map, which is the whole point:
   * the brands used to be derived at runtime from whatever was in the master
   * that night, so one oddly-named new scheme could shorten its AMC's brand
   * and silently drop funds that matched the day before. Injectable only so
   * tests can state a vocabulary explicitly.
   */
  brands: ReadonlyMap<string, string> = BRAND_TO_AMC,
  /** Whether an AMC is in the map at all; paired with `brands`. */
  mapped: (amcKey: string) => boolean = isMappedAmc,
): TerJoinResult {
  // An AMC we hold no brands for cannot be joined at all. It is set aside
  // BEFORE the join rather than falling through it, so its schemes are
  // reported as our own mapping gap instead of looking like AMFI omitted
  // them — and so they can never be matched by another AMC's brand.
  const unmappedAmc = schemes.filter((s) => !mapped(amcKey(s.amcName)));
  const joinable = unmappedAmc.length === 0 ? schemes : schemes.filter((s) => mapped(amcKey(s.amcName)));

  // Our side, keyed by (AMC, scheme name).
  const schemesByKey = new Map<string, JoinScheme[]>();
  for (const s of joinable) {
    const key = joinKey(amcKey(s.amcName), normaliseSchemeName(s.schemeName));
    const list = schemesByKey.get(key);
    if (list) list.push(s);
    else schemesByKey.set(key, [s]);
  }

  // Their side, keyed the same way. A TER row with no usable direct figure is
  // dropped here rather than counted as a claim on the key: an empty cell is
  // not a competing answer.
  const terByKey = new Map<string, JoinTerRow[]>();
  const unknownAmc: string[] = [];
  for (const row of terRows) {
    if (row.directTerPct == null) continue;
    const amc = amcForTerName(row.nameKey, brands);
    if (amc === null) {
      unknownAmc.push(row.schemeName);
      continue;
    }
    const key = joinKey(amc, row.nameKey);
    const list = terByKey.get(key);
    if (list) list.push(row);
    else terByKey.set(key, [row]);
  }

  const matches: TerMatch[] = [];
  const ambiguous: TerJoinResult['ambiguous'] = [];
  const matchedCodes = new Set<string>();

  for (const [key, rows] of terByKey) {
    const candidates = schemesByKey.get(key);
    if (!candidates || candidates.length === 0) continue;

    if (candidates.length > 1) {
      ambiguous.push({ key, reason: 'multiple_schemes', count: candidates.length });
      continue;
    }
    // Two TER rows for one (AMC, name) that disagree on the figure means the
    // name is not identifying a single scheme. Rows that agree are the same
    // answer written twice and are safe.
    const distinct = new Set(rows.map((r) => r.directTerPct));
    if (distinct.size > 1) {
      ambiguous.push({ key, reason: 'multiple_ter_rows', count: rows.length });
      continue;
    }

    // The latest-dated of the agreeing rows, so two runs over the same file
    // record the same asOf.
    const row = rows.reduce((a, b) => (b.asOf > a.asOf ? b : a));
    const scheme = candidates[0]!;
    matches.push({
      schemeCode: scheme.schemeCode,
      amfiName: scheme.schemeName,
      terName: row.schemeName,
      amcName: scheme.amcName,
      terPct: row.directTerPct!,
      asOf: row.asOf,
    });
    matchedCodes.add(scheme.schemeCode);
  }

  const ambiguousKeys = new Set(ambiguous.map((a) => a.key));
  const unmatched = joinable.filter((s) => {
    if (matchedCodes.has(s.schemeCode)) return false;
    const key = joinKey(amcKey(s.amcName), normaliseSchemeName(s.schemeName));
    return !ambiguousKeys.has(key);
  });

  return { matches, unmatched, ambiguous, unknownAmc, unmappedAmc };
}

/** Schemes caught by an ambiguous key — they get AMBIGUOUS, not UNMATCHED. */
export function ambiguousSchemes(
  schemes: JoinScheme[],
  ambiguous: TerJoinResult['ambiguous'],
): JoinScheme[] {
  const keys = new Set(ambiguous.map((a) => a.key));
  return schemes.filter((s) =>
    keys.has(joinKey(amcKey(s.amcName), normaliseSchemeName(s.schemeName))),
  );
}

/** Re-exported so the brand-map test can assert brands survive normalisation
 *  without reaching into the TER parser for it. */
export { normaliseSchemeName as normaliseSchemeNameForTest };
