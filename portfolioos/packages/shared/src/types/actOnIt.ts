/**
 * API shapes for /api/act-on-it (docs/superpowers/specs/2026-11-06-act-on-it-design.md).
 * Money as strings with 2 dp; rates as percent numbers.
 */

/**
 * Where a recommendation stands, as the user sees it.
 * CONFIRMED = seen in their data; CONFIRMED_BY_USER = they said they did it
 * (listed, never counted in the ₹ total); SKIPPED = dismissed or expired;
 * WITHDRAWN = no longer true before they acted; BEFORE_TRACKING = given
 * before the track record existed.
 */
export type AdviceState =
  | 'OPEN'
  | 'SNOOZED'
  | 'ACCEPTED'
  | 'CONFIRMED'
  | 'CONFIRMED_BY_USER'
  | 'SKIPPED'
  | 'WITHDRAWN'
  | 'BEFORE_TRACKING';

export type AdviceRiskBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AdviceWhyNow {
  kind: 'BALANCE' | 'FACTS';
  /** BALANCE: month-end balances, oldest first, and the buffer line. */
  months?: { month: string; balance: string }[];
  bufferInr?: string | null;
  /** FACTS: short label/value pairs from the facts the advice used. */
  items?: { label: string; value: string }[];
}

export interface AdviceCardView {
  id: string;
  category: string;
  headline: string;
  rationale: string;
  gainInr: string | null;
  riskBand: AdviceRiskBand;
  costInr: string | null;
  liquidity: string | null;
  confidence: 'HIGH' | 'MEDIUM';
  urgent: boolean;
  expiresAt: string | null;
  createdAt: string;
  state: AdviceState;
  whyNow: AdviceWhyNow | null;
  /** For a do-nothing vs act comparison chart: the money and the two yearly rates. */
  twoPaths: { amountInr: string; doNothingRatePct: number; actRatePct: number; doNothingLabel: string; actLabel: string } | null;
}

/**
 * GAINED / LOST: advice followed, ahead of or behind doing nothing.
 * MISSED / AVOIDED: advice skipped; acting would have earned (missed) or lost (avoided).
 */
export type AdviceOutcome = 'GAINED' | 'LOST' | 'MISSED' | 'AVOIDED' | 'WAITING' | 'NOT_MEASURED' | 'PENDING' | 'BEFORE_TRACKING' | 'NONE';

export interface AdviceHistoryRow {
  id: string;
  date: string;
  category: string;
  headline: string;
  state: AdviceState;
  outcome: AdviceOutcome;
  /** Signed: positive gained, negative missed. Null when not measured (yet). */
  outcomeInr: string | null;
  promisedGainInr: string | null;
  note: string | null;
}

export interface ActOnItRecord {
  given: number;
  /** Accepted or done (including by the user's own word). */
  acted: number;
  /** Seen in the user's data. */
  confirmed: number;
  skipped: number;
  /** Measured results of confirmed advice: more than doing nothing. */
  totalInr: string;
  /** Measured results of skipped advice: what acting would have added. */
  missedInr: string;
  measured: number;
}

export interface ActOnItView {
  compliance: { inaNumber: string | null; line: string };
  current: AdviceCardView | null;
  waiting: AdviceCardView[];
  record: ActOnItRecord;
  history: AdviceHistoryRow[];
}

export interface AdviceWhyView {
  id: string;
  headline: string;
  rationale: string;
  /** What the advice was built from, frozen when it was given. */
  facts: { label: string; value: string }[];
  measuredBy: string;
  givenAt: string;
}

export interface AdvicePopupView {
  promptId: string;
  recommendationId: string;
  headline: string;
  gainInr: string | null;
  riskBand: string | null;
  liquidity: string | null;
  urgent: boolean;
}
