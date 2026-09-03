import { api, unwrap } from './client';
import type { ApiResponse } from '@portfolioos/shared';

/**
 * Advisor API contract.
 *
 * Every interface in this file is a transcription of what the backend actually
 * serialises — `RiskProfileResult`, `ApprovedProductRow`, `RecommendationView`,
 * `ModelPortfolioSummary`, `AdvisorRunView` and the inline object literal in
 * `advisor.controller.getAllocation`. The backend shapes are persisted and
 * covered by tests, so they are the source of truth: when the two disagree,
 * this file is what changes.
 *
 * Money always arrives as a decimal STRING (`…Inr` suffix). Never coerce it
 * with Number() — hand it to formatINR / <Money>.
 */

// ─── Buckets ─────────────────────────────────────────────────────────────────

/**
 * The closed set of allocation buckets, mirroring the `AdvisorAssetBucket`
 * enum in the API's Prisma schema and `ADVISOR_ASSET_BUCKETS` in
 * services/advisor/types.ts. Anything outside this list is rejected by the
 * zod schemas on every advisor write.
 */
export const ADVISOR_ASSET_BUCKETS = [
  'EQUITY_DOMESTIC',
  'EQUITY_INTERNATIONAL',
  'DEBT',
  'GOLD',
  'REAL_ASSETS',
  'CASH_EQUIVALENT',
  'OTHER_ALT',
] as const;

export type AdvisorAssetBucket = (typeof ADVISOR_ASSET_BUCKETS)[number];

// ─── Risk profile ────────────────────────────────────────────────────────────

export type RiskCategory = 'CONSERVATIVE' | 'BALANCED' | 'GROWTH' | 'AGGRESSIVE';

export type RiskHorizon = 'LT_3Y' | 'Y3_7' | 'Y7_15' | 'GT_15Y';
export type DrawdownReaction = 'SELL_ALL' | 'SELL_SOME' | 'HOLD' | 'BUY_MORE';
export type InvestableShare = 'LT_10' | 'PCT_10_20' | 'PCT_20_35' | 'GT_35';
export type RiskObjective = 'PRESERVE' | 'INCOME' | 'BALANCED_GROWTH' | 'MAX_GROWTH';
export type TaxSlab = 'PCT_5' | 'PCT_20' | 'PCT_30' | 'UNSURE';

/**
 * Closed set, mirroring the AdvisorProvenance enum in the API's Prisma schema.
 * APPROVED_LIST means a human adviser curated this instrument; FALLBACK_RANKING
 * means it was ranked algorithmically on NAV history alone. Showing the wrong
 * one misrepresents who stands behind the recommendation, so this is a union
 * rather than a string the UI pattern-matches on.
 */
export type AdvisorProvenance = 'APPROVED_LIST' | 'FALLBACK_RANKING' | 'NONE';

/**
 * A deterministic rule that moved the raw questionnaire score into a
 * different band (e.g. "no emergency fund" caps you at BALANCED). Surfaced
 * verbatim so the user can see exactly why their category isn't what the
 * raw answers alone would imply.
 */
export interface RiskProfileOverride {
  rule: string;
  from: RiskCategory;
  to: RiskCategory;
  reason: string;
}

export interface RiskQuestionnaireInput {
  /** Nullable on the wire — the API's zod schema accepts a null age. */
  age: number | null;
  horizon: RiskHorizon;
  drawdownReaction: DrawdownReaction;
  investableShareOfIncome: InvestableShare;
  objective: RiskObjective;
  hasEmergencyFund: boolean;
  taxSlab: TaxSlab;
}

export interface AllocationTargetRow {
  bucket: AdvisorAssetBucket;
  targetPct: number;
}

/** `RiskProfileResult.modelPortfolio` — the template this verdict maps onto. */
export interface RiskProfileModelPortfolio {
  id: string;
  name: string;
  riskCategory: RiskCategory;
  versionId: string;
  version: number;
  targets: AllocationTargetRow[];
}

/** riskProfile.service.RiskProfileResult, field for field. */
export interface RiskProfile {
  assessmentId: string;
  questionnaireVersion: number;
  score: number;
  category: RiskCategory;
  /** Null when the investor answered "not sure" — an unknown slab stays
   *  unknown rather than defaulting to the top bracket. */
  taxSlabPct: number | null;
  overrides: RiskProfileOverride[];
  /** The answers that produced this verdict. Echoed back so a retake starts
   *  from what was said last time instead of a blank form. */
  answers: RiskQuestionnaireInput;
  modelPortfolio: RiskProfileModelPortfolio | null;
  assessedAt: string;
}

/** riskProfile.service.AssessmentHistoryRow — no `answers`, no model summary. */
export interface RiskAssessmentHistoryRow {
  assessmentId: string;
  questionnaireVersion: number;
  score: number;
  category: RiskCategory;
  taxSlabPct: number | null;
  overrides: RiskProfileOverride[];
  modelPortfolioId: string | null;
  assessedAt: string;
}

/**
 * GET /risk-profile returns an ENVELOPE, not a bare profile — the controller
 * composes `{ profile, history }`. Reading it as a bare profile is what made
 * `profile.overrides.length` throw at runtime.
 */
export interface RiskProfileResponse {
  profile: RiskProfile | null;
  history: RiskAssessmentHistoryRow[];
}

// ─── Allocation ──────────────────────────────────────────────────────────────

export interface AllocationCurrentRow {
  bucket: AdvisorAssetBucket;
  currentPct: number;
  /** Decimal string. Never parse for display. */
  currentValueInr: string;
}

export interface AllocationDriftRow {
  bucket: AdvisorAssetBucket;
  currentPct: number;
  targetPct: number;
  /** Signed drift in percentage points (current − target). */
  driftPp: number;
  /** Signed decimal string; positive = too much money in this bucket. */
  driftValueInr: string;
}

/** The active model portfolio the allocation was measured against. */
export interface AllocationModelPortfolio {
  id: string;
  name: string;
  riskCategory: RiskCategory;
  versionId: string | null;
  version: number | null;
}

export interface AllocationResponse {
  asOf: string;
  /** Decimal string. Never parse for display. */
  totalValueInr: string;
  modelPortfolio: AllocationModelPortfolio | null;
  /** Flagged explicitly by the backend: "no model portfolio yet" and "targets
   *  all zero" are different states and only one is worth prompting about. */
  hasTargets: boolean;
  current: AllocationCurrentRow[];
  target: AllocationTargetRow[];
  drift: AllocationDriftRow[];
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export type RecommendationStatus = 'OPEN' | 'ACCEPTED' | 'DISMISSED' | 'SNOOZED' | 'DONE';

export type RecommendationCategory =
  | 'REBALANCE'
  | 'CONCENTRATION_TRIM'
  | 'TAX_HARVEST'
  | 'GOAL_SHORTFALL_SIP'
  | 'CASH_DEPLOYMENT'
  | 'RISK_PROFILE_REVIEW';

export type TradeDirection = 'BUY' | 'SELL' | 'SWITCH';

/** advisor/types.ts TradeAction. `units` is null whenever the price behind it
 *  was stale — the rupee amount is always present instead. */
export interface TradeAction {
  direction: TradeDirection;
  bucket: AdvisorAssetBucket;
  portfolioId: string | null;
  instrumentName: string;
  fundId: string | null;
  stockId: string | null;
  isin: string | null;
  holdingKey: string | null;
  units: string | null;
  /** Decimal string. Never parse for display. */
  amountInr: string;
}

/** advisorRecommendations.service.RecommendationView, field for field. */
export interface Recommendation {
  id: string;
  generationRunId: string;
  ruleId: string;
  ruleVersion: number;
  category: RecommendationCategory;
  /** Lower is more urgent — the feed sorts ascending. */
  priority: number;
  action: TradeAction[];
  /** Deterministic, rule-derived explanation. Always shown. */
  rationale: string;
  /** Optional LLM-written prose. Never a substitute for `rationale`. */
  llmProse: string | null;
  llmModel: string | null;
  /** Decimal string. Never parse for display. */
  llmCostInr: string | null;
  inputsSnapshot: Record<string, unknown>;
  riskProfileAssessmentId: string | null;
  modelPortfolioVersionId: string | null;
  provenance: AdvisorProvenance;
  provenanceRef: Record<string, unknown> | null;
  dedupeKey: string;
  supersededById: string | null;
  status: RecommendationStatus;
  statusNote: string | null;
  snoozedUntil: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** advisorEngine.service.AdvisorRunResult. */
export interface RegenerateResult {
  runId: string;
  status: 'COMPLETED' | 'FAILED';
  /** Live recommendations this run stands behind — new plus re-affirmed. */
  recommendationCount: number;
  created: number;
  refreshed: number;
  superseded: number;
  suppressed: number;
  ruleErrors: Record<string, string>;
  ruleVersions: Record<string, number>;
  startedAt: string;
  completedAt: string | null;
}

/**
 * PATCH /recommendations/:id/status body. The note field is `note` — that is
 * what the controller's zod schema names it, and anything else is silently
 * dropped rather than rejected.
 */
export interface StatusUpdateInput {
  status: RecommendationStatus;
  note?: string;
  /** ISO datetime; only meaningful with status SNOOZED. */
  snoozedUntil?: string;
}

export type ProseResult =
  | { status: 'ok'; prose: string }
  | { status: 'disabled' | 'capped' | 'rejected' | 'failed'; reason: string };

// ─── Approved products ───────────────────────────────────────────────────────

/**
 * approvedProducts.service.ApprovedProductRow, field for field.
 *
 * Note what is NOT here: symbol, ISIN, scheme code. A row points at a
 * MutualFundMaster or StockMaster by id and carries the adviser's own `label`
 * for display. Exactly one of fundId / stockId is set.
 */
export interface ApprovedProduct {
  id: string;
  modelPortfolioId: string;
  bucket: AdvisorAssetBucket;
  /** Presentation order within the bucket — 1..n for the live list. Retired
   *  rows are parked at rank <= 0. */
  rank: number;
  fundId: string | null;
  stockId: string | null;
  label: string;
  notes: string | null;
  isActive: boolean;
  addedAt: string;
  removedAt: string | null;
}

/**
 * POST /approved-products body. `modelPortfolioId` and `bucket` are required
 * by the controller's zod schema, and exactly one of fundId / stockId must be
 * present — both, or neither, is a 400.
 */
export interface ApprovedProductInput {
  modelPortfolioId: string;
  bucket: AdvisorAssetBucket;
  label: string;
  fundId?: string | null;
  stockId?: string | null;
  notes?: string | null;
}

export interface ApprovedProductFilter {
  modelPortfolioId?: string;
  bucket?: AdvisorAssetBucket;
  includeInactive?: boolean;
}

// ─── Model portfolios ────────────────────────────────────────────────────────

/** modelPortfolio.service.ModelPortfolioVersionSummary. */
export interface ModelPortfolioVersion {
  id: string;
  version: number;
  targets: AllocationTargetRow[];
  note: string | null;
  createdAt: string;
}

/** modelPortfolio.service.ModelPortfolioSummary. */
export interface ModelPortfolio {
  id: string;
  name: string;
  riskCategory: RiskCategory;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion: ModelPortfolioVersion | null;
}

// ─── Runs ────────────────────────────────────────────────────────────────────

/** advisorRecommendations.service.AdvisorRunView. */
export interface AdvisorRun {
  id: string;
  triggeredBy: 'USER' | 'SYSTEM';
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  engineVersion: string;
  ruleVersionsSnapshot: Record<string, number>;
  ruleErrors: Record<string, string> | null;
  riskProfileAssessmentId: string | null;
  recommendationCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface LlmStatus {
  enabled: boolean;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export const advisorApi = {
  // Risk profile
  async riskProfile(): Promise<RiskProfileResponse> {
    const { data } = await api.get<ApiResponse<RiskProfileResponse>>('/api/advisor/risk-profile');
    const res = unwrap(data);
    // A missing envelope half degrades to "never assessed" rather than
    // throwing inside a component that reads `.overrides.length`.
    return { profile: res?.profile ?? null, history: res?.history ?? [] };
  },
  async submitRiskProfile(input: RiskQuestionnaireInput): Promise<RiskProfile> {
    const { data } = await api.post<ApiResponse<RiskProfile>>('/api/advisor/risk-profile', input);
    return unwrap(data);
  },

  // Allocation
  async allocation(): Promise<AllocationResponse> {
    const { data } = await api.get<ApiResponse<AllocationResponse>>('/api/advisor/allocation');
    return unwrap(data);
  },

  // Recommendations
  async recommendations(status?: RecommendationStatus): Promise<Recommendation[]> {
    const { data } = await api.get<ApiResponse<Recommendation[]>>('/api/advisor/recommendations', {
      params: status ? { status } : undefined,
    });
    return unwrap(data) ?? [];
  },
  /** POST /api/advisor/regenerate — a top-level route, NOT nested under
   *  /recommendations. */
  async regenerate(): Promise<RegenerateResult> {
    const { data } = await api.post<ApiResponse<RegenerateResult>>('/api/advisor/regenerate');
    return unwrap(data);
  },
  async setStatus(id: string, input: StatusUpdateInput): Promise<Recommendation> {
    const { data } = await api.patch<ApiResponse<Recommendation>>(
      `/api/advisor/recommendations/${id}/status`,
      input,
    );
    return unwrap(data);
  },
  async prose(id: string): Promise<ProseResult> {
    const { data } = await api.post<ApiResponse<ProseResult>>(
      `/api/advisor/recommendations/${id}/prose`,
    );
    return unwrap(data);
  },

  // Approved products
  async approvedProducts(filter: ApprovedProductFilter = {}): Promise<ApprovedProduct[]> {
    const { data } = await api.get<ApiResponse<ApprovedProduct[]>>(
      '/api/advisor/approved-products',
      { params: filter },
    );
    return unwrap(data) ?? [];
  },
  async addApprovedProduct(input: ApprovedProductInput): Promise<ApprovedProduct> {
    const { data } = await api.post<ApiResponse<ApprovedProduct>>(
      '/api/advisor/approved-products',
      input,
    );
    return unwrap(data);
  },
  async removeApprovedProduct(id: string): Promise<void> {
    await api.delete(`/api/advisor/approved-products/${id}`);
  },

  // Model portfolios
  async modelPortfolios(): Promise<ModelPortfolio[]> {
    const { data } = await api.get<ApiResponse<ModelPortfolio[]>>('/api/advisor/model-portfolios');
    return unwrap(data) ?? [];
  },
  /** The body key is `weights`, and the response is the newly inserted
   *  VERSION — editing targets never mutates the current one. */
  async setModelPortfolioTargets(
    id: string,
    weights: AllocationTargetRow[],
    note?: string,
  ): Promise<ModelPortfolioVersion> {
    const { data } = await api.put<ApiResponse<ModelPortfolioVersion>>(
      `/api/advisor/model-portfolios/${id}/targets`,
      note != null ? { weights, note } : { weights },
    );
    return unwrap(data);
  },

  // Runs & LLM availability
  async runs(): Promise<AdvisorRun[]> {
    const { data } = await api.get<ApiResponse<AdvisorRun[]>>('/api/advisor/runs');
    return unwrap(data) ?? [];
  },
  async llmStatus(): Promise<LlmStatus> {
    const { data } = await api.get<ApiResponse<LlmStatus>>('/api/advisor/llm-status');
    return unwrap(data);
  },
};

// ─── Shared query keys ───────────────────────────────────────────────────────

export const advisorKeys = {
  riskProfile: ['advisor', 'risk-profile'] as const,
  allocation: ['advisor', 'allocation'] as const,
  recommendations: (status?: RecommendationStatus) =>
    ['advisor', 'recommendations', status ?? 'ALL'] as const,
  approvedProducts: (modelPortfolioId?: string) =>
    ['advisor', 'approved-products', modelPortfolioId ?? 'ALL'] as const,
  modelPortfolios: ['advisor', 'model-portfolios'] as const,
  llmStatus: ['advisor', 'llm-status'] as const,
  runs: ['advisor', 'runs'] as const,
};

// ─── Display labels ──────────────────────────────────────────────────────────

export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  CONSERVATIVE: 'Conservative',
  BALANCED: 'Balanced',
  GROWTH: 'Growth',
  AGGRESSIVE: 'Aggressive',
};

export const RISK_CATEGORY_BLURB: Record<RiskCategory, string> = {
  CONSERVATIVE: 'Capital protection first. Modest equity, heavy on debt and cash.',
  BALANCED: 'Steady growth with a cushion. Roughly even split between equity and debt.',
  GROWTH: 'Long-horizon compounding. Equity-led, with debt for ballast.',
  AGGRESSIVE: 'Maximum growth, accepting deep drawdowns along the way.',
};

/** Human labels for the seven bucket codes the backend actually returns.
 *  Unknown codes fall back to title case rather than rendering a raw enum. */
const BUCKET_LABELS: Record<AdvisorAssetBucket, string> = {
  EQUITY_DOMESTIC: 'Equity — Domestic',
  EQUITY_INTERNATIONAL: 'Equity — International',
  DEBT: 'Debt',
  GOLD: 'Gold',
  REAL_ASSETS: 'Real assets',
  CASH_EQUIVALENT: 'Cash equivalent',
  OTHER_ALT: 'Other / alternatives',
};

export function bucketLabel(bucket: string): string {
  const known = (BUCKET_LABELS as Record<string, string | undefined>)[bucket];
  if (known) return known;
  return (bucket ?? '')
    .toLowerCase()
    .split('_')
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}
