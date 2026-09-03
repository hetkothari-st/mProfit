import { api, unwrap } from './client';
import type { ApiResponse } from '@portfolioos/shared';

// ─── Risk profile ────────────────────────────────────────────────────────────

export type RiskCategory = 'CONSERVATIVE' | 'BALANCED' | 'GROWTH' | 'AGGRESSIVE';

export type RiskHorizon = 'LT_3Y' | 'Y3_7' | 'Y7_15' | 'GT_15Y';
export type DrawdownReaction = 'SELL_ALL' | 'SELL_SOME' | 'HOLD' | 'BUY_MORE';
export type InvestableShare = 'LT_10' | 'PCT_10_20' | 'PCT_20_35' | 'GT_35';
export type RiskObjective = 'PRESERVE' | 'INCOME' | 'BALANCED_GROWTH' | 'MAX_GROWTH';
export type TaxSlab = 'PCT_5' | 'PCT_20' | 'PCT_30' | 'UNSURE';

/**
 * A deterministic rule that moved the raw questionnaire score into a
 * different band (e.g. "no emergency fund" caps you at BALANCED). Surfaced
 * verbatim so the user can see exactly why their category isn't what the
 * raw answers alone would imply.
 */
/**
 * Closed set, mirroring the AdvisorProvenance enum in the API's Prisma schema.
 * APPROVED_LIST means a human adviser curated this instrument; FALLBACK_RANKING
 * means it was ranked algorithmically on NAV history alone. Showing the wrong
 * one misrepresents who stands behind the recommendation, so this is a union
 * rather than a string the UI pattern-matches on.
 */
export type AdvisorProvenance = 'APPROVED_LIST' | 'FALLBACK_RANKING' | 'NONE';

export interface RiskProfileOverride {
  rule: string;
  from: string;
  to: string;
  reason: string;
}

export interface RiskProfile {
  assessmentId: string;
  questionnaireVersion: number;
  category: RiskCategory;
  score: number;
  /** Null when the investor answered "not sure" — an unknown slab stays
   *  unknown rather than defaulting to the top bracket. */
  taxSlabPct: number | null;
  overrides: RiskProfileOverride[];
  /** The answers that produced this verdict. Echoed back so a retake starts
   *  from what was said last time instead of a blank form. */
  answers: RiskQuestionnaireInput;
  assessedAt: string;
}

export interface RiskQuestionnaireInput {
  age: number;
  horizon: RiskHorizon;
  drawdownReaction: DrawdownReaction;
  investableShareOfIncome: InvestableShare;
  objective: RiskObjective;
  hasEmergencyFund: boolean;
  taxSlab: TaxSlab;
}

// ─── Allocation ──────────────────────────────────────────────────────────────

export interface AllocationCurrentRow {
  bucket: string;
  currentPct: number;
  currentValue: string;
}

export interface AllocationTargetRow {
  bucket: string;
  targetPct: number;
}

export interface AllocationDriftRow {
  bucket: string;
  currentPct: number;
  targetPct: number;
  /** Signed drift in percentage points (current − target). */
  driftPp: number;
  /** Pre-formatted-safe decimal string — never parse for display. */
  driftValue: string;
}

export interface AllocationResponse {
  totalValue: string;
  current: AllocationCurrentRow[];
  target: AllocationTargetRow[];
  drift: AllocationDriftRow[];
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export type RecommendationStatus = 'OPEN' | 'ACCEPTED' | 'DISMISSED' | 'SNOOZED' | 'DONE';

export type TradeDirection = 'BUY' | 'SELL' | 'SWITCH';

export interface TradeAction {
  direction: TradeDirection;
  bucket: string;
  instrumentName: string;
  units: string | null;
  amountInr: string;
}

export interface Recommendation {
  id: string;
  category: string;
  /** Lower is more urgent — the feed sorts ascending. */
  priority: number;
  status: RecommendationStatus;
  /** Deterministic, rule-derived explanation. Always shown. */
  rationale: string;
  /** Optional LLM-written prose. Never a substitute for `rationale`. */
  llmProse: string | null;
  action: TradeAction[];
  provenance: AdvisorProvenance;
  inputsSnapshot: Record<string, unknown>;
  createdAt: string;
}

export interface RegenerateResult {
  runId: string;
  recommendationCount: number;
}

export interface StatusUpdateInput {
  status: RecommendationStatus;
  snoozedUntil?: string;
  statusNote?: string;
}

export type ProseResult =
  | { status: 'ok'; prose: string }
  | { status: 'disabled' | 'capped' | 'rejected' | 'failed'; reason: string };

// ─── Approved products / model portfolios / runs ──────────────────────────────

export interface ApprovedProduct {
  id: string;
  bucket: string;
  instrumentName: string;
  symbol: string | null;
  isin: string | null;
  schemeCode: string | null;
  kind: 'STOCK' | 'MUTUAL_FUND' | null;
  /** Ordinal within the bucket — lower ranks first. */
  rank: number;
  note: string | null;
  createdAt: string;
}

export interface ApprovedProductInput {
  bucket: string;
  instrumentName: string;
  symbol?: string | null;
  isin?: string | null;
  schemeCode?: string | null;
  kind?: 'STOCK' | 'MUTUAL_FUND' | null;
  rank?: number;
  note?: string | null;
}

export interface ModelPortfolioTarget {
  bucket: string;
  targetPct: number;
}

export interface ModelPortfolio {
  id: string;
  name: string;
  category: RiskCategory;
  targets: ModelPortfolioTarget[];
  updatedAt: string;
}

export interface AdvisorRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  recommendationCount: number;
  trigger: string | null;
}

export interface LlmStatus {
  enabled: boolean;
}

export const advisorApi = {
  // Risk profile
  async riskProfile(): Promise<RiskProfile | null> {
    const { data } = await api.get<ApiResponse<RiskProfile | null>>('/api/advisor/risk-profile');
    return unwrap(data);
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
    return unwrap(data);
  },
  async regenerate(): Promise<RegenerateResult> {
    const { data } = await api.post<ApiResponse<RegenerateResult>>(
      '/api/advisor/recommendations/regenerate',
    );
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
  async approvedProducts(): Promise<ApprovedProduct[]> {
    const { data } = await api.get<ApiResponse<ApprovedProduct[]>>('/api/advisor/approved-products');
    return unwrap(data);
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
    return unwrap(data);
  },
  async setModelPortfolioTargets(
    id: string,
    targets: ModelPortfolioTarget[],
  ): Promise<ModelPortfolio> {
    const { data } = await api.put<ApiResponse<ModelPortfolio>>(
      `/api/advisor/model-portfolios/${id}/targets`,
      { targets },
    );
    return unwrap(data);
  },

  // Runs & LLM availability
  async runs(): Promise<AdvisorRun[]> {
    const { data } = await api.get<ApiResponse<AdvisorRun[]>>('/api/advisor/runs');
    return unwrap(data);
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
  approvedProducts: ['advisor', 'approved-products'] as const,
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

/** Human labels for the bucket codes the backend returns. Unknown codes fall back to title case. */
const BUCKET_LABELS: Record<string, string> = {
  EQUITY: 'Equity',
  EQUITY_LARGE_CAP: 'Equity — Large cap',
  EQUITY_MID_CAP: 'Equity — Mid cap',
  EQUITY_SMALL_CAP: 'Equity — Small cap',
  EQUITY_INTERNATIONAL: 'Equity — International',
  DEBT: 'Debt',
  DEBT_SHORT: 'Debt — Short duration',
  DEBT_LONG: 'Debt — Long duration',
  GOLD: 'Gold',
  CASH: 'Cash',
  REAL_ESTATE: 'Real estate',
  CRYPTO: 'Crypto',
  OTHER: 'Other',
};

export function bucketLabel(bucket: string): string {
  const known = BUCKET_LABELS[bucket];
  if (known) return known;
  return bucket
    .toLowerCase()
    .split('_')
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}
