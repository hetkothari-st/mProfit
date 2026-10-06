/**
 * Named-fund advice: the shapes the API produces and the UI renders.
 *
 * These live in shared rather than being re-declared on each side because the
 * /advisor page once crashed on first load from exactly that drift — the UI
 * assumed one shape while the API returned another, and `tsc` could not see it
 * because the client had its own copy (CONTEXT.md §11).
 */

/** Where a recommendation's instrument came from. Mirrors the
 *  `AdvisorProvenance` enum in the API's Prisma schema. */
export type AdvisorProvenance =
  | 'APPROVED_LIST'
  | 'RANKED_UNIVERSE'
  | 'FALLBACK_RANKING'
  | 'NONE';

/** Why a run could not name funds. Each one is a different fix, so they are
 *  never collapsed into a single "unavailable". */
export type NamedFundFallbackReason =
  | 'flag_disabled'
  | 'no_signed_methodology'
  | 'snapshot_stale'
  | 'no_risk_profile';

/** A metric that could not be computed, and the weight it gave up. Shown so a
 *  reader can see what the score did NOT take into account. */
export interface FundDataGap {
  metric: string;
  reason: string;
  weightReleased: number;
}

/** The fund that nearly won, and why it did not. */
export interface FundRunnerUp {
  schemeCode: string;
  schemeName: string;
  score: number;
  rankInBucket: number;
  whyItLost: string | null;
}

/** A portfolio-fit adjustment that moved the pick away from the raw ranking. */
export interface FundSelectionAdjustment {
  kind: 'HELD_PREFERENCE' | 'OVERLAP_PENALTY' | 'AMC_CAP' | 'HYSTERESIS_HOLD';
  schemeCode: string;
  detail: string;
}

/**
 * Everything needed to reconstruct one fund choice, frozen at the moment the
 * recommendation was made. Stored on the recommendation, not recomputed: the
 * figures a client was shown are never edited.
 */
export interface FundSelectionEvidence {
  score: number;
  rankInBucket: number;
  metrics: Record<string, unknown>;
  dataGaps: FundDataGap[];
  runnerUp: FundRunnerUp | null;
  adjustments: FundSelectionAdjustment[];
  hysteresisHeldIncumbent: boolean;
  methodologyVersion: number | null;
  /** ISO date of the score snapshot the pick was made from. */
  asOfDate: string | null;
}
