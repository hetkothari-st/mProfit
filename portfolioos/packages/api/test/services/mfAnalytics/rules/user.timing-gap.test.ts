/**
 * `mf.user.timing-gap` — the user's money-weighted return trails the fund's own.
 *
 * `05 §4` marks this one "descriptive only, never advisory", and the wording
 * assertions below are the enforcement of that. A negative gap is usually not a
 * decision at all — it is what a SIP into a fund that rose early produces — and
 * there is nothing the user can do today to change when past money went in. A
 * finding that is unactionable and implies fault is just blame.
 */

import { describe, it, expect } from 'vitest';
import { serializeRatio } from '@portfolioos/shared';
import type { MfMetricStatus, Ratio } from '@portfolioos/shared';
import { userTimingGapRule } from '../../../../src/services/mfAnalytics/rules/user.timing-gap.js';
import { factsForFund } from './_facts.fixture.js';

interface Case {
  timingGap?: Ratio | null;
  holdingPeriodDays?: number;
  userXirrStatus?: MfMetricStatus;
  fundCagrSamePeriod?: Ratio | null;
}

function evaluate({
  timingGap = serializeRatio('-0.05'),
  holdingPeriodDays = 1200,
  userXirrStatus = 'OK',
  fundCagrSamePeriod = serializeRatio('0.1425'),
}: Case = {}) {
  const { facts, schemeCode } = factsForFund({
    held: { timingGap, holdingPeriodDays, userXirrStatus, fundCagrSamePeriod },
  });
  return userTimingGapRule.evaluate(facts, schemeCode);
}

describe('mf.user.timing-gap', () => {
  it('fires on a material gap over a long enough holding period', () => {
    const found = evaluate();

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('NEGATIVE_TIMING_GAP');
    expect(found[0]!.severity).toBe('INFO');
    expect(found[0]!.category).toBe('USER');
  });

  it('stays silent one notch inside the threshold', () => {
    expect(evaluate({ timingGap: serializeRatio('-0.031') })).toHaveLength(1);
    // Exactly at the ceiling: the trigger is `< -0.03`.
    expect(evaluate({ timingGap: serializeRatio('-0.03') })).toEqual([]);
  });

  it('stays silent under the minimum holding period', () => {
    // Below three years the statistic is dominated by one lump sum's entry date
    // rather than by a pattern of contributions.
    expect(evaluate({ holdingPeriodDays: 1095 })).toHaveLength(1);
    expect(evaluate({ holdingPeriodDays: 1094 })).toEqual([]);
  });

  it('names the threshold, and stays descriptive rather than advisory', () => {
    const found = evaluate();
    const counterfactual = found[0]!.whatWouldChangeThis;

    expect(counterfactual.length).toBeGreaterThan(0);
    expect(counterfactual).toContain('3 points a year');

    // `05 §4`: descriptive only. No instruction and no blame, in either field.
    const text = `${found[0]!.headline} ${counterfactual}`.toLowerCase();
    for (const advisory of ['you should', 'switch', 'sell', 'mistake', 'poor timing', 'cost you']) {
      expect(text).not.toContain(advisory);
    }
  });

  it('is silent when the return inputs are missing rather than assuming zero', () => {
    // A gap is the difference of two returns. If the XIRR did not converge, the
    // difference does not exist — it is not a small number.
    expect(evaluate({ userXirrStatus: 'INSUFFICIENT_DATA' })).toEqual([]);
    expect(evaluate({ timingGap: null })).toEqual([]);
    expect(evaluate({ fundCagrSamePeriod: null })).toEqual([]);
  });
});
