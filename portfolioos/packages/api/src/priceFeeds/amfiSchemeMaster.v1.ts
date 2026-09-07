/**
 * AMFI scheme-master feed — side-effecting half
 * (`docs/mf-analytics/01-DATA-FOUNDATION.md §3`, `07-IMPLEMENTATION-PLAN.md`
 * Task 1.2; `.parse.ts` / `.v1.ts` split per `CONTEXT.md §14`).
 *
 * Responsibilities, and nothing else:
 *   1. Get the AMFI text (network).
 *   2. Hand it to the pure parser.
 *   3. Map each `ParsedSchemeRow` onto the columns of `MfSchemeMeta`.
 *
 * The upsert, the DLQ and the cron live in `jobs/mfMetadataJob.ts`. Keeping the
 * mapping here rather than in the job is deliberate: `01 §3` describes the feed
 * as "AMFI text -> MfSchemeMeta fields", and the mapping is the part a future
 * paid vendor adapter would replace wholesale while the job's upsert/DLQ
 * machinery stays put.
 *
 * ---------------------------------------------------------------------------
 * The endpoint
 * ---------------------------------------------------------------------------
 *
 * AMFI publishes no separate free "scheme master" file. `NAVAll.txt` — already
 * configured as `env.AMFI_NAV_URL` and already fetched daily by
 * `amfi.service.ts` for NAVs — is the master: it carries scheme code, both
 * ISIN columns, scheme name, and (as stateful header lines) the AMC and the
 * AMFI category text. That is every column `MfSchemeMeta` can be populated
 * from without a factsheet.
 *
 * So this module does NOT open a second HTTP path. It calls
 * `fetchAmfiNavText()` from `amfi.service.ts`, so the URL, redirect handling,
 * user-agent and non-2xx behaviour have exactly one definition. If AMFI ever
 * ships a genuinely separate master file, that is a new `.v2.ts`, not an edit
 * here (`CONTEXT.md §3.4`).
 */

import {
  parseAmfiNavAll,
  linkGrowthSiblings,
  AMFI_SCHEME_MASTER_ADAPTER_ID,
  AMFI_SCHEME_MASTER_ADAPTER_VERSION,
  type AmfiMasterParseResult,
  type ParsedSchemeRow,
} from './amfiSchemeMaster.parse.js';
import { fetchAmfiNavText } from './amfi.service.js';
import { normaliseAmcName, normaliseAmcCode } from '../adapters/mfFactsheet/registry.js';
import {
  SEBI_SUBCATEGORY_MAP,
  UNMAPPED_SUBCATEGORY,
  type SebiSubCategory,
  type SebiSubCategorySpec,
  type MfPlanType,
  type MfOptionType,
  type SebiCategory,
} from '@portfolioos/shared';

export { AMFI_SCHEME_MASTER_ADAPTER_ID, AMFI_SCHEME_MASTER_ADAPTER_VERSION };

/**
 * Fetch + parse. Separated from `fetchAmfiNavText` only so callers that
 * already have the bytes (the backfill script reading a saved file, the job
 * test reading a fixture) share the exact same parse path as production.
 */
export async function fetchAmfiSchemeMaster(): Promise<AmfiMasterParseResult> {
  const text = await fetchAmfiNavText();
  return parseAmfiSchemeMasterText(text);
}

/**
 * `parseAmfiNavAll` already runs `linkGrowthSiblings` internally. It is run
 * again here, and that is intentional rather than sloppy: the call is
 * idempotent (a second pass recomputes the same map and rewrites the same
 * codes), it costs two array maps over ~12,000 rows, and it means a future
 * refactor that drops the parser's internal call cannot silently ship
 * unlinked IDCW rows — which would not throw, would not fail a schema check,
 * and would only surface as "this fund has no rating" months later (`03 §1`).
 */
export function parseAmfiSchemeMasterText(text: string): AmfiMasterParseResult {
  const parsed = parseAmfiNavAll(text);
  return { schemes: linkGrowthSiblings(parsed.schemes), failures: parsed.failures };
}

/**
 * The subset of `MfSchemeMeta` this feed is authoritative for.
 *
 * Deliberately absent: `riskometer`, `exitLoadText`, `exitLoadRules`, `minSip`,
 * `predecessorSchemeCode`. None of them appear in `NAVAll.txt`. They are owned
 * by the factsheet half of `mfMetadataJob` (`07` Task 1.5) and by the merger
 * curation path (`01 §7`); writing `null` into them from here would erase a
 * value another writer had legitimately populated.
 *
 * Also absent: `inceptionDate`. It is required by the schema but is not in the
 * file at all, so the job resolves it from NAV history at insert time — see
 * `resolveInceptionDate` there. It is a create-only column.
 *
 * `isEtf` from the parser has no column on `MfSchemeMeta` today. It is carried
 * on the mapped row anyway so the ETF/index-fund split `03 §5` needs is
 * available to the caller without re-deriving it from the scheme name.
 */
export interface MappedSchemeMeta {
  schemeCode: string;
  isin: string | null;
  schemeName: string;
  amcCode: string;
  amcName: string;
  sebiCategory: SebiCategory;
  sebiSubCategory: string;
  planType: MfPlanType;
  optionType: MfOptionType;
  benchmarkIndexCode: string | null;
  growthSiblingSchemeCode: string | null;
  sourceHash: string;
  /** Not a column; the best available `inceptionDate` seed for a new row. */
  navDate: Date | null;
  /**
   * Exchange-traded fund, from the parser's `isEtfName`. Now a real column on
   * `MfSchemeMeta` (migration 20260904175500): 03 §5 scores an ETF's STRUCTURE
   * pillar on bid-ask / iNAV deviation and an index fund's on cash drag, and
   * AMFI files both under one "Index Funds/ETFs" sub-category.
   */
  isEtf: boolean;
  /** True where the sub-category could not be mapped — excluded from universes. */
  isUnmapped: boolean;
}

/**
 * AMFI's AMC name -> a stable `amcCode`.
 *
 * `normaliseAmcName` returns a *registered* adapter code, or `null` when it
 * recognises nothing — it refuses to guess, because a wrong code routes one
 * AMC's schemes at another AMC's factsheet adapter, which then parses the
 * wrong fund's page and succeeds.
 *
 * `MfSchemeMeta.amcCode` is nevertheless NOT NULL, so unrecognised AMCs get a
 * deterministic slug of the name instead. That is not a guess at an adapter:
 * a slug can never collide with a registered code (those are short — `SBI`,
 * `HDFC`, `ICICI_PRU` — while a slug always carries the rest of the AMFI name,
 * e.g. `SBI_MUTUAL_FUND`), so an unrecognised AMC still resolves to
 * `AMC_NOT_SUPPORTED` downstream, which is the correct answer.
 */
export function resolveAmcCode(amcName: string): string {
  return normaliseAmcName(amcName) ?? normaliseAmcCode(amcName);
}

/**
 * Tier-1 benchmark for the sub-category, from `SEBI_SUBCATEGORY_MAP`.
 *
 * `null` for UNMAPPED sub-categories and for sub-categories the map leaves
 * without a `defaultBenchmarkCode` (sectoral/thematic funds, FoFs — SEBI does
 * not mandate one index for them and picking one would fabricate the alpha
 * every metric downstream computes against it).
 *
 * Existence in `BenchmarkIndex` is deliberately NOT checked here: the seed is
 * Task 1.3's, running the two in either order must not change what this feed
 * writes, and `MfSchemeMeta.benchmarkIndexCode` is a soft reference with no FK
 * precisely so the two can land independently (`01 §2`).
 */
export function resolveBenchmarkCode(sebiSubCategory: string): string | null {
  if (sebiSubCategory === UNMAPPED_SUBCATEGORY) return null;
  // Indexed with a runtime string, so the lookup really can miss (a
  // sub-category the parser produced from an alias the map later dropped).
  // `specFor` types the miss away; this does not.
  const spec = SEBI_SUBCATEGORY_MAP[sebiSubCategory as SebiSubCategory] as
    | SebiSubCategorySpec
    | undefined;
  return spec?.defaultBenchmarkCode ?? null;
}

/** Map one parsed row onto the columns this feed owns. Pure. */
export function toSchemeMeta(row: ParsedSchemeRow): MappedSchemeMeta {
  return {
    schemeCode: row.schemeCode,
    isin: row.isin,
    schemeName: row.schemeName,
    amcCode: resolveAmcCode(row.amcName),
    amcName: row.amcName,
    sebiCategory: row.sebiCategory,
    // Stored verbatim, including the literal 'UNMAPPED' sentinel: `01 §3` keeps
    // such schemes queryable and merely excludes them from peer universes.
    sebiSubCategory: row.sebiSubCategory,
    planType: row.planType,
    optionType: row.optionType,
    benchmarkIndexCode: resolveBenchmarkCode(row.sebiSubCategory),
    growthSiblingSchemeCode: row.growthSiblingSchemeCode,
    sourceHash: row.sourceHash,
    navDate: row.navDate,
    isEtf: row.isEtf,
    isUnmapped: row.sebiSubCategory === UNMAPPED_SUBCATEGORY,
  };
}

/**
 * Map a whole parse result, collapsing duplicate scheme codes.
 *
 * AMFI has historically repeated a scheme under two category headers during a
 * re-categorisation month. `MfSchemeMeta.schemeCode` is the primary key, so
 * two rows cannot both land; upserting both in file order would make the
 * winner depend on line order, and the row would flip category every time AMFI
 * reshuffled the file. The LAST occurrence wins, matching how the existing
 * `loadAmfiNavToDb` de-duplicates its master rows, and the collision is
 * returned so the job can put it in the DLQ instead of resolving it silently.
 */
export interface MappedSchemeMasterResult {
  schemes: MappedSchemeMeta[];
  duplicateSchemeCodes: string[];
  failures: AmfiMasterParseResult['failures'];
}

export function mapSchemeMaster(parsed: AmfiMasterParseResult): MappedSchemeMasterResult {
  const byCode = new Map<string, MappedSchemeMeta>();
  const duplicates = new Set<string>();

  for (const row of parsed.schemes) {
    const mapped = toSchemeMeta(row);
    if (byCode.has(mapped.schemeCode)) duplicates.add(mapped.schemeCode);
    byCode.set(mapped.schemeCode, mapped);
  }

  return {
    schemes: Array.from(byCode.values()),
    duplicateSchemeCodes: Array.from(duplicates),
    failures: parsed.failures,
  };
}
