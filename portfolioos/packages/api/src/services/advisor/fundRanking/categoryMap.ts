/**
 * Which schemes may be considered for which advisor bucket.
 *
 * Explicit and reviewed, never fuzzy. A substring match on the AMFI header
 * would quietly put a "Banking and PSU Debt Fund" in EQUITY_DOMESTIC the day
 * AMFI renames a section, and the first anyone would know is a client holding
 * a debt fund bought as equity.
 *
 * Two layers, because AMFI gives us two things:
 *   1. `MutualFundMaster.category` — our own coarse enum.
 *   2. `subCategory` — the raw AMFI header, which carries the SEBI category
 *      ("Equity Scheme - Flexi Cap Fund", "Debt Scheme - Liquid Fund").
 *
 * The SEBI category decides when we can read it; the coarse enum is the
 * fallback. Anything we cannot place is excluded with `category_unknown`
 * rather than guessed into a bucket.
 */

import type { AdvisorAssetBucketValue } from '../types.js';

/** SEBI category fragments, matched case-insensitively against `subCategory`.
 *  Order matters: the first match wins, so narrower entries come first. */
const SEBI_CATEGORY_TO_BUCKET: Array<[string, AdvisorAssetBucketValue]> = [
  // Gold and silver first: they are "Other Scheme - Gold ETF" and would
  // otherwise be caught by the ETF/equity rules below.
  ['gold', 'GOLD'],
  ['silver', 'REAL_ASSETS'],

  // Cash-like debt. Liquid and overnight funds are where an emergency fund
  // actually lives, so they are cash, not debt ballast.
  ['liquid fund', 'CASH_EQUIVALENT'],
  ['overnight fund', 'CASH_EQUIVALENT'],
  ['money market', 'CASH_EQUIVALENT'],
  ['ultra short', 'CASH_EQUIVALENT'],

  // International equity, before the generic equity rules.
  ['international', 'EQUITY_INTERNATIONAL'],
  ['global', 'EQUITY_INTERNATIONAL'],
  ['overseas', 'EQUITY_INTERNATIONAL'],
  ['us equity', 'EQUITY_INTERNATIONAL'],
  ['nasdaq', 'EQUITY_INTERNATIONAL'],

  ['debt scheme', 'DEBT'],
  ['gilt', 'DEBT'],
  ['corporate bond', 'DEBT'],
  ['banking and psu', 'DEBT'],
  ['short duration', 'DEBT'],
  ['medium duration', 'DEBT'],
  ['long duration', 'DEBT'],
  ['dynamic bond', 'DEBT'],
  ['credit risk', 'DEBT'],
  ['floater', 'DEBT'],
  ['fixed maturity', 'DEBT'],

  ['equity scheme', 'EQUITY_DOMESTIC'],
  ['index funds', 'EQUITY_DOMESTIC'],
  ['index fund', 'EQUITY_DOMESTIC'],
  ['exchange traded fund', 'EQUITY_DOMESTIC'],

  // REITs and InvITs are real assets, not equity, whatever the wrapper.
  ['reit', 'REAL_ASSETS'],
  ['invit', 'REAL_ASSETS'],
];

/**
 * Coarse fallback when `subCategory` is missing or unrecognised.
 *
 * HYBRID and SOLUTION_ORIENTED are deliberately absent: a balanced-advantage
 * fund is part equity and part debt, and putting it in one bucket would
 * misstate the allocation it is bought to correct. They stay held-and-reported
 * rather than recommended, which is the same call `constants.ts` makes by
 * targeting REAL_ASSETS and OTHER_ALT at zero.
 */
const MF_CATEGORY_TO_BUCKET: Partial<Record<string, AdvisorAssetBucketValue>> = {
  EQUITY: 'EQUITY_DOMESTIC',
  ELSS: 'EQUITY_DOMESTIC',
  INDEX_FUND: 'EQUITY_DOMESTIC',
  ETF: 'EQUITY_DOMESTIC',
  DEBT: 'DEBT',
  FMP: 'DEBT',
  LIQUID: 'CASH_EQUIVALENT',
};

/** The bucket a scheme may be recommended for, or null if we cannot place it. */
export function bucketForScheme(
  category: string,
  subCategory: string | null,
  schemeName: string,
): AdvisorAssetBucketValue | null {
  const haystack = `${subCategory ?? ''} ${schemeName}`.toLowerCase();
  for (const [fragment, bucket] of SEBI_CATEGORY_TO_BUCKET) {
    if (haystack.includes(fragment)) return bucket;
  }
  return MF_CATEGORY_TO_BUCKET[category] ?? null;
}

/** True when the scheme tracks an index — scored on cost and tracking, never
 *  on past returns, because a tracker that beat its index did so by failing at
 *  its one job. */
export function isPassive(category: string, schemeName: string, subCategory: string | null): boolean {
  if (category === 'INDEX_FUND' || category === 'ETF') return true;
  const haystack = `${subCategory ?? ''} ${schemeName}`.toLowerCase();
  return (
    haystack.includes('index') ||
    haystack.includes('exchange traded') ||
    haystack.includes(' etf') ||
    haystack.endsWith('etf')
  );
}

/**
 * The index a passive scheme tracks, normalised, so same-index peers can be
 * compared with each other when we have no benchmark TRI.
 *
 * Returns null when the name does not say. A null here means the fund is
 * compared against its bucket peers instead, and the evidence says so.
 */
export function trackedIndexKey(schemeName: string): string | null {
  const n = schemeName.toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/nifty\s*50(?!\s*value|\s*equal)/, 'NIFTY50'],
    [/nifty\s*next\s*50/, 'NIFTYNEXT50'],
    [/nifty\s*100/, 'NIFTY100'],
    [/nifty\s*200/, 'NIFTY200'],
    [/nifty\s*500/, 'NIFTY500'],
    [/nifty\s*midcap\s*150/, 'NIFTYMIDCAP150'],
    [/nifty\s*smallcap\s*250/, 'NIFTYSMALLCAP250'],
    [/nifty\s*bank/, 'NIFTYBANK'],
    [/sensex/, 'SENSEX'],
    [/nasdaq\s*100/, 'NASDAQ100'],
    [/s&p\s*500/, 'SP500'],
  ];
  for (const [re, key] of patterns) {
    if (re.test(n)) return key;
  }
  return null;
}
