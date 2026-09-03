/**
 * The advisor engine's shared contract. Every rule, every math helper and the
 * orchestrator agree on the shapes in this file, and nothing here touches the
 * database or the clock — `AdvisorFacts` is assembled once by the facts builder
 * and handed to rules as immutable input.
 *
 * The reason rules receive facts rather than fetching for themselves: a rule
 * that can query is a rule that cannot be unit-tested without a database, and
 * an advice engine whose rules cannot be tested is an advice engine whose
 * output cannot be defended.
 */

import type { Decimal } from 'decimal.js';
import type { RiskCategoryValue } from '../riskProfileMath.js';

export const ADVISOR_ASSET_BUCKETS = [
  'EQUITY_DOMESTIC',
  'EQUITY_INTERNATIONAL',
  'DEBT',
  'GOLD',
  'REAL_ASSETS',
  'CASH_EQUIVALENT',
  'OTHER_ALT',
] as const;
export type AdvisorAssetBucketValue = (typeof ADVISOR_ASSET_BUCKETS)[number];

export const ADVISOR_RECOMMENDATION_CATEGORIES = [
  'REBALANCE',
  'CONCENTRATION_TRIM',
  'TAX_HARVEST',
  'GOAL_SHORTFALL_SIP',
  'CASH_DEPLOYMENT',
  'RISK_PROFILE_REVIEW',
] as const;
export type AdvisorRecommendationCategoryValue = (typeof ADVISOR_RECOMMENDATION_CATEGORIES)[number];

// ─── Facts ───────────────────────────────────────────────────────

/** A single holding, already bucketed and priced. Identifying fields are copied
 *  (not referenced) because HoldingProjection rows are derived data that get
 *  deleted and rebuilt whenever transactions change — a recommendation must
 *  still read correctly after that happens. */
export interface AdvisorHoldingFact {
  holdingKey: string;
  portfolioId: string;
  assetName: string;
  assetClass: string;
  bucket: AdvisorAssetBucketValue;
  fundId: string | null;
  stockId: string | null;
  isin: string | null;
  quantity: Decimal;
  currentPrice: Decimal | null;
  currentValue: Decimal;
  totalCost: Decimal;
  unrealisedPnL: Decimal;
  /** True when the price behind currentValue is too old to size a trade
   *  against. Rules must not emit unit counts for a stale holding — a
   *  confidently wrong "sell 40 units" is worse than no recommendation. */
  priceStale: boolean;
}

export interface AdvisorGoalFact {
  goalId: string;
  name: string;
  category: string;
  priority: string;
  targetAmount: Decimal;
  currentValue: Decimal;
  remaining: Decimal;
  yearsRemaining: number;
  expectedReturnPct: number | null;
  requiredCagr: number | null;
  isOnTrack: boolean | null;
  currentMonthlyContribution: Decimal | null;
}

export interface AdvisorHarvestCandidateFact {
  portfolioId: string;
  assetName: string;
  assetClass: string;
  isin: string | null;
  quantity: Decimal;
  currentPrice: Decimal | null;
  currentValue: Decimal;
  unrealisedPnL: Decimal;
  longTermEligible: boolean;
  classification: 'STCG_LOSS' | 'LTCG_LOSS' | 'STCG_GAIN' | 'LTCG_GAIN';
  priceStale: boolean;
}

export interface AdvisorProductFact {
  approvedProductId: string | null;
  fundId: string | null;
  stockId: string | null;
  label: string;
  /** Only set for fallback candidates — the NAV-derived score that ranked it. */
  score: number | null;
}

export interface AdvisorAllocationFact {
  bucket: AdvisorAssetBucketValue;
  currentPct: number;
  currentValue: Decimal;
}

export interface AdvisorTargetFact {
  bucket: AdvisorAssetBucketValue;
  targetPct: number;
}

export interface AdvisorFacts {
  userId: string;
  /** Every time-dependent rule reads this instead of Date.now(), so a rule's
   *  output is a pure function of its input and a fixture can pin the date. */
  asOf: Date;
  riskProfile: {
    assessmentId: string | null;
    category: RiskCategoryValue | null;
    age: number | null;
    taxSlabPct: number | null;
    assessedAt: Date | null;
  };
  modelPortfolio: {
    id: string | null;
    versionId: string | null;
    version: number | null;
    targets: AdvisorTargetFact[];
  };
  totalPortfolioValue: Decimal;
  currentAllocation: AdvisorAllocationFact[];
  holdings: AdvisorHoldingFact[];
  goals: AdvisorGoalFact[];
  harvestCandidates: AdvisorHarvestCandidateFact[];
  /** Rank-ordered, adviser-curated. Empty bucket = nothing approved yet. */
  approvedProducts: Record<AdvisorAssetBucketValue, AdvisorProductFact[]>;
  /** Rank-ordered, NAV-derived. Only consulted when the approved list is empty. */
  fallbackRankings: Record<AdvisorAssetBucketValue, AdvisorProductFact[]>;
  liquidity: {
    liquidAssets: Decimal;
    monthlyExpenses: Decimal | null;
    emergencyFundTarget: Decimal | null;
    surplusOverTarget: Decimal | null;
  };
  /** Statutory capital-gains rates in force at asOf, copied from
   *  tax.service.ratesForDate so rules stay pure while the rate table keeps a
   *  single home. Needed because the rate that a harvested loss actually
   *  offsets is NOT the income slab: equity STCG is its own statutory rate,
   *  and using the slab overstates the benefit by half for most users. */
  capitalGainsRates: {
    stcgEquityPct: number;
    ltcgEquityPct: number;
    ltcgOtherNonIndexedPct: number;
    /** Income slab, used only where the gain really is taxed at slab
     *  (non-equity STCG, intraday, F&O). Null when the user has not told us. */
    slabPct: number | null;
  };
  /** Portfolio that BUY legs are attributed to (the user's default). */
  defaultPortfolioId: string | null;
}

// ─── Rule output ─────────────────────────────────────────────────

export type TradeDirection = 'BUY' | 'SELL' | 'SWITCH';

/** A single leg of an instruction. `units` is only ever populated from a real,
 *  non-stale price; `amountInr` is always present so a recommendation stays
 *  actionable even when a unit count cannot be computed honestly. */
export interface TradeAction {
  direction: TradeDirection;
  bucket: AdvisorAssetBucketValue;
  portfolioId: string | null;
  instrumentName: string;
  fundId: string | null;
  stockId: string | null;
  isin: string | null;
  holdingKey: string | null;
  units: string | null;
  amountInr: string;
}

export type ProvenanceValue = 'APPROVED_LIST' | 'FALLBACK_RANKING' | 'NONE';

export interface DraftProvenance {
  kind: ProvenanceValue;
  approvedProductId?: string;
  candidateLabel?: string;
  score?: number;
}

export interface RecommendationDraft {
  ruleId: string;
  ruleVersion: number;
  category: AdvisorRecommendationCategoryValue;
  /** Lower = more urgent. Bands: 1-10 deadline-driven, 11-30 material,
   *  31-60 optimisation. Rules pick within their band; the engine only sorts. */
  priority: number;
  action: TradeAction[];
  /** Deterministic, code-generated, and always containing the figures that
   *  appear in `action`. The justification-invariant test enforces this. */
  rationale: string;
  inputsUsed: Record<string, unknown>;
  provenance: DraftProvenance;
  /** Stable identity for this issue within this rule, so a re-run supersedes
   *  rather than duplicates. */
  dedupeKey: string;
}

/**
 * What a rule is. Adding rule #41 means writing one file that exports this and
 * appending it to the array in rules/index.ts — no engine change, and the
 * justification-invariant suite picks it up automatically.
 */
export interface AdvisorRule {
  id: string;
  /** Bump only when the rule's logic changes its output for identical facts.
   *  Stamped onto every recommendation so old advice stays reconstructable. */
  version: number;
  description: string;
  /** Pure. No I/O, no Date.now(), no randomness. */
  evaluate(facts: AdvisorFacts): RecommendationDraft[];
}
