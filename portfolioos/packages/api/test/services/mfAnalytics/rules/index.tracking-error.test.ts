/**
 * `mf.index.tracking-error` — an index fund tracking worse than its peers.
 *
 * The INDEX guard is the case with teeth. Tracking error is a model-scoped
 * input: `mfScoreMath.directionFor` throws if asked for its direction outside
 * the INDEX model, so `mfPeerRank` never produces this percentile for an
 * active universe. And for an actively managed fund a large tracking error is
 * not a defect at all — it is the measure of active risk. Firing there would
 * invert the finding's meaning.
 */

import { describe, it, expect } from 'vitest';
import { serializeRatio } from '@portfolioos/shared';
import type { MfHorizonMetrics, MfModelKey, Ratio } from '@portfolioos/shared';
import { indexTrackingErrorRule } from '../../../../src/services/mfAnalytics/rules/index.tracking-error.js';
import { factsForFund, makeMetricsRow, makePeer, makeScore } from './_facts.fixture.js';
import type { MfHorizonKey } from '../../../../src/services/mfAnalytics/types.js';

const HORIZONS: readonly MfHorizonKey[] = ['1', '3', '5', '7', '10'];

interface Case {
  modelKey?: MfModelKey;
  /** Null removes the metric's percentile from the peer row entirely. */
  percentile?: Ratio | null;
  trackingErrorAnn?: Ratio | null;
  scored?: boolean;
}

function evaluate({
  modelKey = 'INDEX',
  percentile = serializeRatio('0.10'),
  trackingErrorAnn = serializeRatio('0.018'),
  scored = true,
}: Case = {}) {
  // `makeMetricsRow` merges shallowly, so the whole `riskAdjusted` block has to
  // be supplied to change one field inside it.
  const riskAdjusted: MfHorizonMetrics['riskAdjusted'] = {
    ...makeMetricsRow(5).riskAdjusted,
    trackingErrorAnn,
  };
  const peerRow = makePeer(
    percentile === null ? {} : { trackingErrorAnn: percentile },
    { trackingErrorAnn: '0.006000' },
  );

  const metrics: Partial<Record<MfHorizonKey, Partial<MfHorizonMetrics>>> = {};
  const peer: Partial<Record<MfHorizonKey, typeof peerRow>> = {};
  for (const key of HORIZONS) {
    metrics[key] = { riskAdjusted };
    peer[key] = peerRow;
  }

  const { facts, schemeCode } = factsForFund({
    score: scored ? makeScore({ modelKey }) : null,
    metrics,
    peer,
  });
  return indexTrackingErrorRule.evaluate(facts, schemeCode);
}

describe('mf.index.tracking-error', () => {
  it('fires for an INDEX fund in the bottom quartile on tracking error', () => {
    const found = evaluate();

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('HIGH_TRACKING_ERROR');
    expect(found[0]!.severity).toBe('WARNING');
    expect(found[0]!.category).toBe('INDEX');
  });

  it('stays silent one notch above the percentile ceiling', () => {
    // The trigger is `< 0.25`, so exactly the 25th percentile does not fire.
    expect(evaluate({ percentile: serializeRatio('0.249') })).toHaveLength(1);
    expect(evaluate({ percentile: serializeRatio('0.25') })).toEqual([]);
  });

  it('does NOT fire outside the INDEX model, whatever the percentile', () => {
    expect(evaluate({ modelKey: 'ACTIVE_EQUITY', percentile: serializeRatio('0.02') })).toEqual([]);
    expect(evaluate({ modelKey: 'DEBT_DURATION', percentile: serializeRatio('0.02') })).toEqual([]);
    expect(evaluate({ modelKey: 'HYBRID', percentile: serializeRatio('0.02') })).toEqual([]);
  });

  it('names the percentile ceiling and the peer group in the counterfactual', () => {
    const counterfactual = evaluate()[0]!.whatWouldChangeThis;
    expect(counterfactual.length).toBeGreaterThan(0);
    expect(counterfactual).toContain('25th percentile');
    expect(counterfactual).toContain('Large Cap Fund|DIRECT');
  });

  it('is silent when an input is missing', () => {
    // No score row: no model to guard on and no universe to compare within.
    expect(evaluate({ scored: false })).toEqual([]);
    // No percentile for the metric.
    expect(evaluate({ percentile: null })).toEqual([]);
    // No tracking-error value to cite as evidence.
    expect(evaluate({ trackingErrorAnn: null })).toEqual([]);
  });
});
