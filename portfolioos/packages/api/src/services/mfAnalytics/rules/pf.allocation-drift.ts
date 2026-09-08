/**
 * `mf.pf.allocation-drift` — `ALLOCATION_DRIFT` (`05 §4`, portfolio scope).
 *
 * ── Silence is not "0% drift" ─────────────────────────────────────────────
 *
 * `lookThrough.target` is `null` when the user has no risk-profile assessment
 * and therefore no active `ModelPortfolioVersion` (`04 §3`). There is then no
 * model to be away from, and the rule is **silent**. It must not read the
 * absent target as "matches perfectly", which is the same class of error as
 * rendering a hidden category as ₹0 (`CONTEXT.md §6`).
 *
 * ── Which buckets are compared ────────────────────────────────────────────
 *
 * `MfAllocationComparison.outsideTolerance` is computed by `04 §3` against the
 * shared `REBALANCE_BAND_PP`, so the analysis page and this finding cannot
 * disagree about which buckets have drifted. This rule therefore takes that
 * list as the candidate set rather than re-deriving it from `drift`, and then
 * re-checks each candidate against `facts.constants.allocationDriftBandPp` —
 * which is `REBALANCE_BAND_PP` by construction, so the second check changes
 * nothing in production and is what makes the boundary testable at all
 * (`05 §3`: thresholds arrive through facts so a test can move one).
 *
 * ── Why the same tolerance as the advisor ─────────────────────────────────
 *
 * `finance/planningBands.ts` records the failure this prevents: a portfolio
 * six points off its model flagged as drifted on `/advisor` and not here, with
 * neither page able to explain the other.
 */

import type { Decimal } from 'decimal.js';
import { serializeRatio, toDecimal, type MfEvidence, type MfFinding } from '@portfolioos/shared';

import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.pf.allocation-drift';
const RULE_VERSION = '1.0.0';

function clip(name: string, max: number): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

export const pfAllocationDriftRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'PORTFOLIO',
  category: 'ALLOCATION',

  evaluate(facts: MfAnalysisFacts): MfFinding[] {
    const target = facts.portfolio.lookThrough.target;
    // No risk profile → no model portfolio → no drift to report.
    if (target === null) return [];

    const bandPp = facts.constants.allocationDriftBandPp;

    const breaches: Array<{ bucket: string; drift: Decimal }> = [];
    for (const bucket of target.outsideTolerance) {
      const drift = target.drift[bucket];
      // A bucket named as outside tolerance with no drift figure beside it is
      // an input we cannot cite. Dropping it is the honest handling: a finding
      // whose evidence cannot be filled is one nobody can dispute.
      if (drift === undefined) continue;
      const value = toDecimal(drift);
      if (value.abs().greaterThan(bandPp)) breaches.push({ bucket, drift: value });
    }

    if (breaches.length === 0) return [];

    const worst = breaches.reduce((a, b) => (b.drift.abs().greaterThan(a.drift.abs()) ? b : a));
    const over = worst.drift.isPositive();
    const targetPct = target.target[worst.bucket];
    const actualPct = target.actual[worst.bucket];

    const headline =
      `${clip(worst.bucket, 18)} is ${worst.drift.abs().toFixed(1)}pp ` +
      `${over ? 'above' : 'below'} the ${clip(target.model, 24)} model target` +
      (breaches.length > 1 ? ` (+${breaches.length - 1} more)` : '');

    const evidence: MfEvidence[] = [
      {
        metric: 'lookThrough.target.drift',
        label: `${worst.bucket} drift from the ${target.model} model, in percentage points`,
        value: serializeRatio(worst.drift),
        unit: 'pct',
      },
      {
        metric: 'constants.allocationDriftBandPp',
        label: 'Rebalance band shared with the advisor REBALANCE rule',
        value: serializeRatio(bandPp),
        unit: 'pct',
      },
    ];

    if (actualPct !== undefined) {
      evidence.push({
        metric: 'lookThrough.target.actual',
        label: `${worst.bucket} — actual share of the mutual fund book`,
        value: serializeRatio(toDecimal(actualPct)),
        unit: 'pct',
      });
    }
    if (targetPct !== undefined) {
      evidence.push({
        metric: 'lookThrough.target.target',
        label: `${worst.bucket} — ${target.model} model target`,
        value: serializeRatio(toDecimal(targetPct)),
        unit: 'pct',
      });
    }

    const partial = facts.portfolio.scope.partial;
    const counterfactual =
      `Would clear once ${worst.bucket} is within ${bandPp} percentage points of the ` +
      `${target.model} model` +
      (targetPct === undefined ? '' : ` target of ${toDecimal(targetPct).toFixed(1)}%`) +
      `; it is ${worst.drift.abs().toFixed(1)}pp ${over ? 'above' : 'below'} it today.` +
      (partial
        ? ' The actual shares are computed over the holdings shared with you only, so the ' +
          'drift is a floor on what the household portfolio would show.'
        : '');

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode: null,
        code: 'ALLOCATION_DRIFT',
        category: 'ALLOCATION',
        severity: 'WARNING',
        confidence: confidenceFor(),
        headline,
        evidence,
        whatWouldChangeThis: counterfactual,
      }),
    ];
  },
};
