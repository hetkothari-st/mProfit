/**
 * SEBI scheme categorisation (circular SEBI/HO/IMD/DF3/CIR/P/2017/114 and the
 * later Flexi Cap addendum), reduced to the three things the analytics layer
 * needs from it:
 *
 *   1. which broad category a sub-category belongs to (drives the DB enum),
 *   2. which scoring model applies (`03-SCORING.md §2`),
 *   3. the mandate band the fund is *required* to sit inside, so a style-drift
 *      or duration-mismatch finding can cite the regulation rather than a
 *      threshold we invented.
 *
 * This table is the single mapping. `amfiSchemeMaster.ts` resolves AMFI's free
 * text against it; anything it cannot resolve becomes `UNMAPPED` and is
 * excluded from every peer universe (`01-DATA-FOUNDATION.md §3`) rather than
 * being guessed into the wrong one — a fund ranked against the wrong universe
 * produces a confidently wrong rating, which is worse than no rating.
 */

/** Mirrors the `MfSebiCategory` Prisma enum. */
export type SebiCategory =
  | 'EQUITY'
  | 'DEBT'
  | 'HYBRID'
  | 'SOLUTION_ORIENTED'
  | 'OTHER';

/** Mirrors `MfSchemeScore.modelKey` (`03-SCORING.md §2`). */
export type MfModelKey =
  | 'ACTIVE_EQUITY'
  | 'INDEX'
  | 'DEBT_ULTRA_SHORT'
  | 'DEBT_DURATION'
  | 'HYBRID'
  | 'SOLUTION'
  | 'FOF';

/**
 * Market-cap mandate, as percentage-of-net-assets floors. Used by the
 * `STYLE_DRIFT` rule against `marketCapSplit` from the monthly portfolio
 * disclosure.
 */
export interface CapBand {
  /** Minimum total equity exposure. */
  minEquityPct?: number;
  minLargePct?: number;
  minMidPct?: number;
  minSmallPct?: number;
  /** Focused funds: SEBI caps the holding count, not the cap split. */
  maxHoldings?: number;
  /** Sectoral/thematic: minimum exposure to the declared theme. */
  minThemePct?: number;
}

/**
 * Macaulay-duration mandate in years.
 *
 * SEBI defines these bands on **Macaulay** duration, while factsheets and
 * `02-METRICS.md §7` report **modified** duration. Modified = Macaulay / (1 + y/n),
 * so modified is always the smaller number and a naive comparison biases
 * every fund toward "below band". `DURATION_MISMATCH` must convert before it
 * compares, or compare Macaulay where the factsheet discloses it.
 */
export interface DurationBand {
  minYears: number | null;
  maxYears: number | null;
  /** Set where SEBI mandates a fixed duration rather than a range (Gilt 10y). */
  exactYears?: number;
}

/** Credit-quality mandate, as percentage-of-net-assets floors. */
export interface CreditBand {
  /** e.g. Corporate Bond: >= 80% in AA+ and above. */
  minPctAtOrAbove?: { rating: string; pct: number };
  /** e.g. Credit Risk: >= 65% *below* AA+. */
  minPctBelow?: { rating: string; pct: number };
  /** e.g. Gilt: >= 80% G-secs; Banking & PSU: >= 80% bank/PSU/PFI paper. */
  minPctIssuerType?: { issuerType: string; pct: number };
}

/** Equity-share mandate for hybrids, as a percentage band. */
export interface EquityBand {
  minPct: number | null;
  maxPct: number | null;
}

export interface SebiSubCategorySpec {
  sebiCategory: SebiCategory;
  modelKey: MfModelKey;
  /** The benchmark family this sub-category is normally measured against. */
  defaultBenchmarkCode?: string;
  capBand?: CapBand;
  durationBand?: DurationBand;
  creditBand?: CreditBand;
  equityBand?: EquityBand;
  /** True where the fund's mandate is a single sector/theme. */
  thematic?: boolean;
}

/**
 * Keys are the canonical sub-category names. AMFI text is normalised to these
 * (case- and punctuation-insensitive, plus the alias table below) before
 * lookup.
 *
 * 39 entries, not the 36 of the original circular: Flexi Cap was added in
 * 2020, and Index Funds/ETFs and the FoF flavours are listed separately here
 * because they take different scoring models.
 */
export const SEBI_SUBCATEGORY_MAP = {
  // -- Equity (12) --------------------------------------------------------
  'Large Cap Fund': {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    defaultBenchmarkCode: 'NIFTY100_TRI',
    capBand: { minEquityPct: 80, minLargePct: 80 },
  },
  'Large & Mid Cap Fund': {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    defaultBenchmarkCode: 'NIFTY_LARGEMIDCAP250_TRI',
    capBand: { minEquityPct: 70, minLargePct: 35, minMidPct: 35 },
  },
  'Mid Cap Fund': {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    defaultBenchmarkCode: 'NIFTY_MIDCAP150_TRI',
    capBand: { minEquityPct: 65, minMidPct: 65 },
  },
  'Small Cap Fund': {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    defaultBenchmarkCode: 'NIFTY_SMALLCAP250_TRI',
    capBand: { minEquityPct: 65, minSmallPct: 65 },
  },
  'Multi Cap Fund': {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    defaultBenchmarkCode: 'NIFTY500_TRI',
    // The 2021 amendment: 25% each in large, mid and small.
    capBand: { minEquityPct: 75, minLargePct: 25, minMidPct: 25, minSmallPct: 25 },
  },
  'Flexi Cap Fund': {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    defaultBenchmarkCode: 'NIFTY500_TRI',
    capBand: { minEquityPct: 65 },
  },
  'Dividend Yield Fund': {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    defaultBenchmarkCode: 'NIFTY500_TRI',
    capBand: { minEquityPct: 65 },
  },
  'Value Fund': {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    defaultBenchmarkCode: 'NIFTY500_TRI',
    capBand: { minEquityPct: 65 },
  },
  'Contra Fund': {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    defaultBenchmarkCode: 'NIFTY500_TRI',
    capBand: { minEquityPct: 65 },
  },
  'Focused Fund': {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    defaultBenchmarkCode: 'NIFTY500_TRI',
    capBand: { minEquityPct: 65, maxHoldings: 30 },
  },
  'Sectoral/Thematic Fund': {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    capBand: { minEquityPct: 80, minThemePct: 80 },
    thematic: true,
  },
  ELSS: {
    sebiCategory: 'EQUITY', modelKey: 'ACTIVE_EQUITY',
    defaultBenchmarkCode: 'NIFTY500_TRI',
    capBand: { minEquityPct: 80 },
  },

  // -- Debt (16) ----------------------------------------------------------
  'Overnight Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_ULTRA_SHORT',
    defaultBenchmarkCode: 'NIFTY_LIQUID',
    durationBand: { minYears: null, maxYears: 1 / 365 },
  },
  'Liquid Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_ULTRA_SHORT',
    defaultBenchmarkCode: 'NIFTY_LIQUID',
    durationBand: { minYears: null, maxYears: 91 / 365 },
  },
  'Ultra Short Duration Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_ULTRA_SHORT',
    durationBand: { minYears: 3 / 12, maxYears: 6 / 12 },
  },
  'Low Duration Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_ULTRA_SHORT',
    durationBand: { minYears: 6 / 12, maxYears: 1 },
  },
  'Money Market Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_ULTRA_SHORT',
    // SEBI constrains residual maturity (<= 1y), not Macaulay duration.
    durationBand: { minYears: null, maxYears: 1 },
  },
  'Short Duration Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_DURATION',
    defaultBenchmarkCode: 'NIFTY_SHORT_DURATION_DEBT',
    durationBand: { minYears: 1, maxYears: 3 },
  },
  'Medium Duration Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_DURATION',
    durationBand: { minYears: 3, maxYears: 4 },
  },
  'Medium to Long Duration Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_DURATION',
    durationBand: { minYears: 4, maxYears: 7 },
  },
  'Long Duration Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_DURATION',
    durationBand: { minYears: 7, maxYears: null },
  },
  'Dynamic Bond Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_DURATION',
    defaultBenchmarkCode: 'CRISIL_COMPOSITE_BOND',
    // Deliberately unconstrained -- duration is the manager's active call, so
    // DURATION_MISMATCH must not fire here.
    durationBand: { minYears: null, maxYears: null },
  },
  'Corporate Bond Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_DURATION',
    defaultBenchmarkCode: 'NIFTY_CORPORATE_BOND',
    creditBand: { minPctAtOrAbove: { rating: 'AA+', pct: 80 } },
  },
  'Credit Risk Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_DURATION',
    // The one sub-category where below-AA+ paper is the mandate, not a flaw:
    // LOW_CREDIT_QUALITY is suppressed here (`05 §4`).
    creditBand: { minPctBelow: { rating: 'AA+', pct: 65 } },
  },
  'Banking and PSU Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_DURATION',
    creditBand: { minPctIssuerType: { issuerType: 'BANK_PSU_PFI', pct: 80 } },
  },
  'Gilt Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_DURATION',
    creditBand: { minPctIssuerType: { issuerType: 'SOVEREIGN', pct: 80 } },
  },
  'Gilt Fund with 10 year constant duration': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_DURATION',
    durationBand: { minYears: null, maxYears: null, exactYears: 10 },
    creditBand: { minPctIssuerType: { issuerType: 'SOVEREIGN', pct: 80 } },
  },
  'Floater Fund': {
    sebiCategory: 'DEBT', modelKey: 'DEBT_DURATION',
    creditBand: { minPctIssuerType: { issuerType: 'FLOATING_RATE', pct: 65 } },
  },

  // -- Hybrid (7) ---------------------------------------------------------
  'Conservative Hybrid Fund': {
    sebiCategory: 'HYBRID', modelKey: 'HYBRID',
    equityBand: { minPct: 10, maxPct: 25 },
  },
  'Balanced Hybrid Fund': {
    sebiCategory: 'HYBRID', modelKey: 'HYBRID',
    equityBand: { minPct: 40, maxPct: 60 },
  },
  'Aggressive Hybrid Fund': {
    sebiCategory: 'HYBRID', modelKey: 'HYBRID',
    defaultBenchmarkCode: 'NIFTY50_HYBRID_COMPOSITE_DEBT_65_35_TRI',
    equityBand: { minPct: 65, maxPct: 80 },
  },
  'Dynamic Asset Allocation or Balanced Advantage Fund': {
    sebiCategory: 'HYBRID', modelKey: 'HYBRID',
    // 0-100% by mandate: equity-allocation drift is not a finding here.
    equityBand: { minPct: 0, maxPct: 100 },
  },
  'Multi Asset Allocation Fund': {
    sebiCategory: 'HYBRID', modelKey: 'HYBRID',
    // >= 3 asset classes, >= 10% each. Not expressible as an equity band.
  },
  'Arbitrage Fund': {
    sebiCategory: 'HYBRID', modelKey: 'HYBRID',
    // >= 65% equity, but fully hedged -- the risk profile is cash-like, which
    // is why it scores in the hybrid universe and not the equity one.
    equityBand: { minPct: 65, maxPct: 100 },
  },
  'Equity Savings Fund': {
    sebiCategory: 'HYBRID', modelKey: 'HYBRID',
    equityBand: { minPct: 65, maxPct: 100 },
  },

  // -- Solution oriented (2) ----------------------------------------------
  'Retirement Fund': {
    sebiCategory: 'SOLUTION_ORIENTED', modelKey: 'SOLUTION',
  },
  "Children's Fund": {
    sebiCategory: 'SOLUTION_ORIENTED', modelKey: 'SOLUTION',
  },

  // -- Other (2) ----------------------------------------------------------
  'Index Funds/ETFs': {
    sebiCategory: 'OTHER', modelKey: 'INDEX',
  },
  'FoF (Overseas/Domestic)': {
    sebiCategory: 'OTHER', modelKey: 'FOF',
  },
} as const satisfies Record<string, SebiSubCategorySpec>;

export type SebiSubCategory = keyof typeof SEBI_SUBCATEGORY_MAP;

/** Sentinel for schemes whose AMFI category text we could not resolve. */
export const UNMAPPED_SUBCATEGORY = 'UNMAPPED';

/**
 * AMFI (and AMC) free text for the same sub-category. Left-hand side is
 * compared after `normaliseCategoryText`, so only genuine wording differences
 * need an entry -- not case, spacing or punctuation variants.
 */
const SUBCATEGORY_ALIASES: Record<string, SebiSubCategory> = {
  'large cap': 'Large Cap Fund',
  'largecap fund': 'Large Cap Fund',
  'large and mid cap fund': 'Large & Mid Cap Fund',
  'large & midcap fund': 'Large & Mid Cap Fund',
  'mid cap': 'Mid Cap Fund',
  'midcap fund': 'Mid Cap Fund',
  'small cap': 'Small Cap Fund',
  'smallcap fund': 'Small Cap Fund',
  'multi cap': 'Multi Cap Fund',
  'flexi cap': 'Flexi Cap Fund',
  'flexicap fund': 'Flexi Cap Fund',
  elss: 'ELSS',
  'equity linked savings scheme': 'ELSS',
  'elss fund': 'ELSS',
  'tax saver': 'ELSS',
  'sectoral fund': 'Sectoral/Thematic Fund',
  'thematic fund': 'Sectoral/Thematic Fund',
  'sectoral / thematic fund': 'Sectoral/Thematic Fund',
  'sector fund': 'Sectoral/Thematic Fund',
  'banking and psu debt fund': 'Banking and PSU Fund',
  'banking & psu fund': 'Banking and PSU Fund',
  '10 year gilt fund': 'Gilt Fund with 10 year constant duration',
  'dynamic asset allocation fund': 'Dynamic Asset Allocation or Balanced Advantage Fund',
  'balanced advantage fund': 'Dynamic Asset Allocation or Balanced Advantage Fund',
  'dynamic asset allocation or balanced advantage':
    'Dynamic Asset Allocation or Balanced Advantage Fund',
  'index fund': 'Index Funds/ETFs',
  'index funds': 'Index Funds/ETFs',
  etf: 'Index Funds/ETFs',
  'exchange traded fund': 'Index Funds/ETFs',
  'index funds/etfs': 'Index Funds/ETFs',
  'fof overseas': 'FoF (Overseas/Domestic)',
  'fof domestic': 'FoF (Overseas/Domestic)',
  'fund of funds': 'FoF (Overseas/Domestic)',
  'fof (overseas/domestic)': 'FoF (Overseas/Domestic)',
  'childrens fund': "Children's Fund",
  'children fund': "Children's Fund",
  // -- wording taken from the LIVE NAVAll.txt, not from the circular. AMFI's
  // header text differs from SEBI's own category names in small ways that a
  // reader would not predict, and each of these was an UNMAPPED scheme (and so
  // an excluded universe member) until it was added.
  "children's fund - childrens' fund": "Children's Fund",
  "childrens' fund": "Children's Fund",
  'elss- tax saver fund': 'ELSS',
  'elss - tax saver fund': 'ELSS',
  'tax saver fund': 'ELSS',
  'sectoral/ thematic': 'Sectoral/Thematic Fund',
  'sectoral/thematic': 'Sectoral/Thematic Fund',
  'dynamic bond': 'Dynamic Bond Fund',
  'floater fund': 'Floater Fund',
  'money market fund': 'Money Market Fund',
  'overnight fund': 'Overnight Fund',
  'balanced hybrid fund': 'Balanced Hybrid Fund',
  'dynamic asset allocation/balanced advantage':
    'Dynamic Asset Allocation or Balanced Advantage Fund',
  'retirement fund': 'Retirement Fund',
  'other scheme - index funds': 'Index Funds/ETFs',
  'gilt fund with 10 year constant duration':
    'Gilt Fund with 10 year constant duration',

  // -- Legacy AMFI headers, still used for schemes launched before the 2017
  // categorisation circular. They are not SEBI category names any more, but
  // AMFI never rewrote the historical blocks, and a fund carrying one is a
  // live open-ended fund that would otherwise be UNMAPPED and silently absent
  // from every peer universe. Mapped to the nearest current sub-category.
  'income/debt oriented schemes - liquid fund': 'Liquid Fund',
  'income/debt oriented schemes - overnight fund': 'Overnight Fund',
  'income/debt oriented schemes - money market fund': 'Money Market Fund',
  'income/debt oriented schemes - ultra short term fund': 'Ultra Short Duration Fund',
  'income/debt oriented schemes - ultra short to short term fund': 'Low Duration Fund',
  'income/debt oriented schemes - short term fund': 'Short Duration Fund',
  'income/debt oriented schemes - medium term fund': 'Medium Duration Fund',
  'income/debt oriented schemes - medium to long term fund': 'Medium to Long Duration Fund',
  'income/debt oriented schemes - long term fund': 'Long Duration Fund',
  'income/debt oriented schemes - corporate bond fund': 'Corporate Bond Fund',
  'income/debt oriented schemes - credit risk fund': 'Credit Risk Fund',
  'income/debt oriented schemes - banking and psu fund': 'Banking and PSU Fund',
  'income/debt oriented schemes - gilt fund': 'Gilt Fund',
  'income/debt oriented schemes - floating interest rates fund': 'Floater Fund',
  'income/debt oriented schemes - dynamic bond': 'Dynamic Bond Fund',
  'money market': 'Money Market Fund',
  'index funds - equity funds': 'Index Funds/ETFs',
  'index funds - debt funds': 'Index Funds/ETFs',
  'index funds - hybrid fund': 'Index Funds/ETFs',
  'other scheme - gold etf': 'Index Funds/ETFs',
  'other scheme - other etfs': 'Index Funds/ETFs',
  'other scheme - other  etfs': 'Index Funds/ETFs',
  'overseas fund of funds - fund of funds investing overseas': 'FoF (Overseas/Domestic)',
  'other scheme - fund of funds': 'FoF (Overseas/Domestic)',
  "solution oriented scheme - children's fund": "Children's Fund",
  'solution oriented schemes ** - retirement fund': 'Retirement Fund',
  'solution oriented scheme - retirement fund': 'Retirement Fund',
};

/**
 * Lowercase, collapse whitespace, strip the SEBI broad-category prefix AMFI
 * prepends ("Equity Scheme - Large Cap Fund"), drop trailing punctuation.
 * Deliberately does **not** strip the word "Fund": stripping would collide
 * "Gilt Fund" with "Gilt Fund with 10 year constant duration".
 */
export function normaliseCategoryText(text: string): string {
  return text
    .toLowerCase()
    // Footnote markers and whitespace FIRST: AMFI writes
    // "Solution Oriented Schemes ** - Retirement Fund", and the `**` sits
    // between the prefix and its dash, so stripping the prefix before the
    // markers leaves the prefix regex unable to match its own separator.
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(equity|debt|hybrid|solution\s*oriented|other)\s*schemes?\s*[-–—:]\s*/, '')
    .replace(/[.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve AMFI category text to a canonical sub-category, or `null` when we
 * cannot. `null` is the honest answer and the caller writes an
 * `IngestionFailure(unmapped_sebi_category)`; guessing would rank the fund in
 * the wrong universe.
 */
export function resolveSubCategory(text: string | null | undefined): SebiSubCategory | null {
  if (!text) return null;
  const n = normaliseCategoryText(text);
  for (const key of Object.keys(SEBI_SUBCATEGORY_MAP) as SebiSubCategory[]) {
    if (normaliseCategoryText(key) === n) return key;
  }
  return SUBCATEGORY_ALIASES[n] ?? null;
}

export function specFor(sub: SebiSubCategory): SebiSubCategorySpec {
  return SEBI_SUBCATEGORY_MAP[sub];
}

/** `universeKey` per `03-SCORING.md §1`. One place, so ranks and lookups agree. */
export function universeKey(sub: string, planType: 'DIRECT' | 'REGULAR'): string {
  return `${sub}|${planType}`;
}
