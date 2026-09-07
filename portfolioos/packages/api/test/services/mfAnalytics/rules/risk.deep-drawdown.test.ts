/**
 * `mf.risk.deep-drawdown` (`05 §4` row 5, `05 §8.1`).
 *
 * The sign convention is the thing most worth protecting here. `maxDrawdown`
 * is stored NEGATIVE while the peer ranker's median is a MAGNITUDE, so an
 * implementation that compared the two raw values would fire on the funds that
 * fell LEAST — and would still "produce a finding" for anyone spot-checking.
 * The last case in this file pins that down explicitly.
 */

import { describe, expect, it } from 'vitest';
import { serializeRatio, type MfHorizonMetrics, type MfMetricStatus } from '@portfolioos/shared';
import { riskDeepDrawdownRule as rule } from '../../../../src/services/mfAnalytics/rules/risk.deep-drawdown.js';
import type { MfHorizonKey } from '../../../../src/services/mfAnalytics/types.js';
import {
  SCHEME,
  makeFacts,
  makeFundFacts,
  makeMetricsRow,
  makePeer,
} from './_facts.fixture.js';

const ALL_HORIZONS: readonly MfHorizonKey[] = ['1', '3', '5', '7', '10'];

function riskRow(
  horizon: 1 | 3 | 5 | 7 | 10,
  maxDrawdown: string | null,
  fieldStatus?: Record<string, MfMetricStatus>,
): Partial<MfHorizonMetrics> {
  const base = makeMetricsRow(horizon);
  return {
    risk: {
      ...base.risk,
      maxDrawdown: maxDrawdown === null ? null : serializeRatio(maxDrawdown),
    },
    ...(fieldStatus === undefined ? {} : { fieldStatus }),
  };
}

/** `maxDrawdown` signed on the metric, magnitude on the peer median. */
function facts(signedDrawdown: string, percentile: string, medianMagnitude = '0.200000') {
  return makeFacts({
    funds: {
      [SCHEME]: makeFundFacts({
        metrics: { '10': riskRow(10, signedDrawdown) },
        peer: {
          '10': makePeer({ maxDrawdown: percentile }, { maxDrawdown: medianMagnitude }),
        },
      }),
    },
  });
}

describe('mf.risk.deep-drawdown', () => {
  it('fires for a bottom-quartile drawdown more than 5pp deeper than the category median', () => {
    // -32% against a 20% category median: 12pp deeper, and ranked 0.10.
    const found = rule.evaluate(facts('-0.32', '0.10'), SCHEME);

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('DEEP_DRAWDOWN');
    expect(finding.severity).toBe('NOTICE');
    expect(finding.category).toBe('RISK');
    expect(finding.headline).toContain('Fell 32.0% peak-to-trough');
    // Evidence keeps the stored sign so the row and the column agree.
    expect(finding.evidence[0]!.value).toBe(serializeRatio('-0.32'));
  });

  it('does not fire one notch below the 5pp gap', () => {
    // -25% against a 20% median is exactly 5pp; `05 §4` says "> 5 pp".
    expect(rule.evaluate(facts('-0.25', '0.10'), SCHEME)).toEqual([]);
  });

  it('does not fire once the fund is out of the category bottom quartile', () => {
    expect(rule.evaluate(facts('-0.32', '0.25'), SCHEME)).toEqual([]);
  });

  it('names the threshold and the category median in whatWouldChangeThis', () => {
    const finding = rule.evaluate(facts('-0.32', '0.10'), SCHEME)[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('5 percentage');
    expect(finding.whatWouldChangeThis).toContain('20.0%');
  });

  it('is silent when the drawdown or its category median is unavailable', () => {
    const noValue: Partial<Record<MfHorizonKey, Partial<MfHorizonMetrics>>> = {};
    for (const key of ALL_HORIZONS) {
      noValue[key] = riskRow(Number(key) as 1 | 3 | 5 | 7 | 10, null, {
        'risk.maxDrawdown': 'INSUFFICIENT_DATA',
      });
    }
    expect(
      rule.evaluate(makeFacts({ funds: { [SCHEME]: makeFundFacts({ metrics: noValue }) } }), SCHEME),
    ).toEqual([]);

    // Median present but no rank, and vice versa: both are required, because
    // each supplies one half of `05 §4`'s sentence.
    const noMedian = makeFacts({
      funds: {
        [SCHEME]: makeFundFacts({
          metrics: { '10': riskRow(10, '-0.32') },
          peer: {
            '1': makePeer({ maxDrawdown: '0.10' }),
            '3': makePeer({ maxDrawdown: '0.10' }),
            '5': makePeer({ maxDrawdown: '0.10' }),
            '7': makePeer({ maxDrawdown: '0.10' }),
            '10': makePeer({ maxDrawdown: '0.10' }),
          },
        }),
      },
    });
    expect(rule.evaluate(noMedian, SCHEME)).toEqual([]);
  });

  it('does not invert: a shallow drawdown never fires, however it is ranked', () => {
    // -0.02 is a 2% fall. Comparing the signed value (-0.02) against the
    // magnitude median (0.20) with the wrong sense would make this the
    // "deepest" fund in the fixture. It must stay silent.
    expect(rule.evaluate(facts('-0.02', '0.05'), SCHEME)).toEqual([]);
  });
});
