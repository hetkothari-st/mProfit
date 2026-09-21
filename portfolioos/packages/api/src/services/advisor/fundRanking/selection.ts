/**
 * Which of the ranked funds this particular client should be told to buy.
 *
 * Ranking answers "which fund is best?". Selection answers "which fund is best
 * FOR THEM?", and the two differ for reasons that have nothing to do with fund
 * quality:
 *
 *   1. They may already hold a perfectly good fund in that bucket. Telling
 *      someone to move from the #3 fund to the #1 fund buys a rounding error
 *      and costs a taxable event.
 *   2. A fund that overlaps heavily with what they already own adds risk
 *      without adding diversification, whatever its score.
 *   3. Four funds from one AMC is a single point of failure — process,
 *      ownership and key-person risk all land at once.
 *   4. Scores move every night as NAVs update. Without hysteresis the "best"
 *      fund changes on noise and the client is told to switch again, which is
 *      how an adviser destroys returns with activity.
 *
 * Pure: no DB, no clock.
 */

import { Decimal } from 'decimal.js';
import type { SelectionConfig } from './types.js';

/** A ranked candidate, as the engine hands it to selection. */
export interface SelectionCandidate {
  schemeCode: string;
  schemeName: string;
  amcName: string;
  fundId: string | null;
  score: number;
  rankInBucket: number;
  /** 0–100 portfolio overlap with the client's existing equity holdings, when
   *  we can compute it. Null means unknown, which is NOT zero. */
  overlapPct: number | null;
}

/** What selection needs to know about the client. */
export interface SelectionContext {
  /** Scheme codes the client already holds in this bucket. */
  heldSchemeCodes: string[];
  /** Value per AMC across the whole portfolio, for the concentration cap. */
  valueByAmc: Record<string, Decimal>;
  totalPortfolioValue: Decimal;
  /** The scheme this client was last told to buy in this bucket, if any. */
  incumbentSchemeCode: string | null;
  /** Consecutive snapshots in which the leading challenger has beaten the
   *  incumbent by more than the margin. Supplied by the caller from snapshot
   *  history; 0 when there is no sustained challenge. */
  challengerStreak: number;
}

export interface SelectionAdjustment {
  kind: 'HELD_PREFERENCE' | 'OVERLAP_PENALTY' | 'AMC_CAP' | 'HYSTERESIS_HOLD';
  schemeCode: string;
  detail: string;
}

export interface SelectionResult {
  chosen: SelectionCandidate | null;
  runnerUp: SelectionCandidate | null;
  /** Why the runner-up lost, in one line, for the evidence trail. */
  runnerUpReason: string | null;
  adjustments: SelectionAdjustment[];
}

/**
 * Pick one fund from the ranked candidates.
 *
 * Deterministic by construction: the same candidates and the same context
 * always produce the same pick, which is what makes a recommendation
 * reproducible months later from its stored evidence.
 */
export function selectFund(
  candidates: SelectionCandidate[],
  context: SelectionContext,
  selection: SelectionConfig,
): SelectionResult {
  const adjustments: SelectionAdjustment[] = [];
  const usable = candidates.filter((c) => Number.isFinite(c.score) && c.rankInBucket > 0);
  if (usable.length === 0) {
    return { chosen: null, runnerUp: null, runnerUpReason: null, adjustments };
  }

  const ranked = [...usable].sort((a, b) =>
    a.rankInBucket !== b.rankInBucket
      ? a.rankInBucket - b.rankInBucket
      : a.schemeCode.localeCompare(b.schemeCode),
  );

  // ── 1. AMC concentration cap ───────────────────────────────────
  // Applied as a filter rather than a penalty: past the cap, "a bit better on
  // paper" does not justify putting more of someone's money behind one AMC's
  // operational risk.
  const capFraction = new Decimal(selection.maxAmcSharePct).dividedBy(100);
  const capped = ranked.filter((c) => {
    if (context.totalPortfolioValue.lessThanOrEqualTo(0)) return true;
    const amcValue = context.valueByAmc[c.amcName] ?? new Decimal(0);
    const share = amcValue.dividedBy(context.totalPortfolioValue);
    if (share.greaterThanOrEqualTo(capFraction)) {
      adjustments.push({
        kind: 'AMC_CAP',
        schemeCode: c.schemeCode,
        detail: `${c.amcName} already holds ${share.times(100).toFixed(1)}% of the portfolio, at or above the ${selection.maxAmcSharePct}% cap`,
      });
      return false;
    }
    return true;
  });
  // If the cap removed everything, fall back to the ranked list rather than
  // emitting no advice: an amount-only instruction helps nobody when we do
  // have a defensible fund to name.
  const afterCap = capped.length > 0 ? capped : ranked;

  // ── 2. Overlap penalty ─────────────────────────────────────────
  // Score is a percentile, so the penalty is in percentile points: a fund
  // overlapping 60% with existing holdings gives up 30 points at the default
  // 0.5/pt, which is enough to lose to a genuinely different fund but not
  // enough to lose to a much worse one.
  const withOverlap = afterCap.map((c) => {
    // A scheme the client already holds is not "overlapping" with itself in
    // any sense worth penalising — adding to it is the top-up case, governed
    // by the held-preference rule below. Penalising it here would have the
    // two rules pulling against each other.
    if (context.heldSchemeCodes.includes(c.schemeCode)) {
      return { candidate: c, effective: c.score };
    }
    if (c.overlapPct == null || c.overlapPct <= selection.maxOverlapPct) {
      return { candidate: c, effective: c.score };
    }
    const excess = c.overlapPct - selection.maxOverlapPct;
    const penalty = excess * selection.overlapPenaltyPerPct;
    adjustments.push({
      kind: 'OVERLAP_PENALTY',
      schemeCode: c.schemeCode,
      detail: `${c.overlapPct.toFixed(0)}% overlap with existing holdings cost it ${penalty.toFixed(1)} points`,
    });
    return { candidate: c, effective: c.score - penalty };
  });

  withOverlap.sort((a, b) =>
    b.effective !== a.effective
      ? b.effective - a.effective
      : a.candidate.schemeCode.localeCompare(b.candidate.schemeCode),
  );

  const leader = withOverlap[0]!.candidate;
  const runnerUp = withOverlap[1]?.candidate ?? null;

  // ── 3. Prefer topping up what they already hold ────────────────
  // A held fund still inside the rank band wins outright. The alternative is
  // recommending a switch for a few percentile points, which costs exit load
  // and capital-gains tax today against a benefit that is speculative.
  const heldInBand = withOverlap.find(
    (w) =>
      context.heldSchemeCodes.includes(w.candidate.schemeCode) &&
      w.candidate.rankInBucket <= selection.incumbentRankBand,
  );
  if (heldInBand && heldInBand.candidate.schemeCode !== leader.schemeCode) {
    adjustments.push({
      kind: 'HELD_PREFERENCE',
      schemeCode: heldInBand.candidate.schemeCode,
      detail: `already held and ranked #${heldInBand.candidate.rankInBucket}, inside the top ${selection.incumbentRankBand} — topping up beats switching`,
    });
    return {
      chosen: heldInBand.candidate,
      runnerUp: leader,
      runnerUpReason: `ranked #${leader.rankInBucket} but switching to it would realise tax and exit load for a small ranking gain`,
      adjustments,
    };
  }

  // ── 4. Hysteresis ──────────────────────────────────────────────
  // The incumbent keeps the recommendation unless a challenger has beaten it
  // by the margin for N consecutive snapshots. Nightly NAVs move scores by
  // fractions of a point; without this the top of the list changes on noise
  // and the client gets a new instruction every week.
  if (context.incumbentSchemeCode && context.incumbentSchemeCode !== leader.schemeCode) {
    const incumbent = withOverlap.find(
      (w) => w.candidate.schemeCode === context.incumbentSchemeCode,
    );
    if (incumbent) {
      const margin = withOverlap[0]!.effective - incumbent.effective;
      const sustained = context.challengerStreak >= selection.hysteresisSnapshots;
      if (margin < selection.hysteresisMarginPct || !sustained) {
        adjustments.push({
          kind: 'HYSTERESIS_HOLD',
          schemeCode: incumbent.candidate.schemeCode,
          detail: sustained
            ? `challenger leads by ${margin.toFixed(1)} points, under the ${selection.hysteresisMarginPct}-point switching margin`
            : `challenger has led for ${context.challengerStreak} of the ${selection.hysteresisSnapshots} snapshots required`,
        });
        return {
          chosen: incumbent.candidate,
          runnerUp: leader,
          runnerUpReason: `leads by ${margin.toFixed(1)} points, which has not yet held long enough to justify switching`,
          adjustments,
        };
      }
    }
  }

  return {
    chosen: leader,
    runnerUp,
    runnerUpReason: runnerUp
      ? `ranked #${runnerUp.rankInBucket} against #${leader.rankInBucket}`
      : null,
    adjustments,
  };
}

/**
 * Whether switching out of a held fund is worth what it costs.
 *
 * Exit load and capital-gains tax are paid today; the ranking advantage is a
 * probability. Suppressing a switch whose net benefit does not clear the
 * materiality tolerance is the difference between advice and churn.
 *
 * The capital-gains rate is the STATUTORY rate for the asset, never the income
 * slab — using the slab overstates the cost of switching for equity, in the
 * opposite direction to the harvest bug but by the same mistake.
 */
export function switchIsWorthIt(args: {
  holdingValue: Decimal;
  unrealisedGain: Decimal;
  /** Statutory rate that applies to this gain, in percent. */
  capitalGainsRatePct: number;
  /** Exit load percentage, or null when we do not hold the schedule. */
  exitLoadPct: number | null;
  /** Expected annual advantage of the challenger, in percentage points. */
  expectedAnnualAdvantagePct: number;
  materialityTolerance: number;
}): { worthIt: boolean; costInr: Decimal; annualBenefitInr: Decimal; exitLoadAssumedZero: boolean } {
  const gain = args.unrealisedGain.greaterThan(0) ? args.unrealisedGain : new Decimal(0);
  const taxCost = gain.times(args.capitalGainsRatePct).dividedBy(100);

  // We do not hold exit-load schedules (DATA-INVENTORY.md). Assuming zero
  // understates the cost, so the caller is told, and the recommendation says
  // so rather than presenting a cost it did not include.
  const exitLoadAssumedZero = args.exitLoadPct == null;
  const exitLoadCost = args.exitLoadPct == null
    ? new Decimal(0)
    : args.holdingValue.times(args.exitLoadPct).dividedBy(100);

  const costInr = taxCost.plus(exitLoadCost);
  const annualBenefitInr = args.holdingValue
    .times(args.expectedAnnualAdvantagePct)
    .dividedBy(100);

  // One year of advantage must clear the one-off cost by more than the
  // materiality band. A switch that pays for itself in five years is a switch
  // whose thesis will not survive five years.
  const worthIt = annualBenefitInr
    .minus(costInr)
    .greaterThan(costInr.times(args.materialityTolerance));

  return { worthIt, costInr, annualBenefitInr, exitLoadAssumedZero };
}
