/**
 * `mf.risk.high-down-capture` (`05 §4` row 4, `05 §8.1`).
 */

import { describe, expect, it } from 'vitest';
import { serializeRatio, type MfHorizonMetrics, type MfMetricStatus } from '@portfolioos/shared';
import { riskHighDownCaptureRule as rule } from '../../../../src/services/mfAnalytics/rules/risk.high-down-capture.js';
import type { MfHorizonKey } from '../../../../src/services/mfAnalytics/types.js';
import {
  SCHEME,
  makeFacts,
  makeFundFacts,
  makeMetricsRow,
  makePeer,
} from './_facts.fixture.js';

const ALL_HORIZONS: readonly MfHorizonKey[] = ['1', '3', '5', '7', '10'];

function relativeRow(
  horizon: 1 | 3 | 5 | 7 | 10,
  downCapture: string | null,
  fieldStatus?: Record<string, MfMetricStatus>,
): Partial<MfHorizonMetrics> {
  const base = makeMetricsRow(horizon);
  return {
    relative: {
      ...base.relative,
      downCapture: downCapture === null ? null : serializeRatio(downCapture),
    },
    ...(fieldStatus === undefined ? {} : { fieldStatus }),
  };
}

function facts(downCapture: string, percentile: string) {
  return makeFacts({
    funds: {
      [SCHEME]: makeFundFacts({
        metrics: { '10': relativeRow(10, downCapture) },
        peer: { '10': makePeer({ downCapture: percentile }, { downCapture: '0.950000' }) },
      }),
    },
  });
}

describe('mf.risk.high-down-capture', () => {
  it('fires when the fund falls harder than the index and harder than its peers', () => {
    const found = rule.evaluate(facts('1.22', '0.12'), SCHEME);

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('HIGH_DOWN_CAPTURE');
    expect(finding.severity).toBe('WARNING');
    expect(finding.category).toBe('RISK');
    // `05 §3`'s own example wording, filled from the evidence.
    expect(finding.headline).toContain('Captured 122% of benchmark losses');
    expect(finding.headline).toContain('category median 95%');
  });

  it('does not fire at the ratio ceiling exactly', () => {
    // `05 §4` says "> 1.10". Falling exactly as the ceiling allows is not a
    // breach of it.
    expect(rule.evaluate(facts('1.10', '0.12'), SCHEME)).toEqual([]);
  });

  it('does not fire one notch above the percentile ceiling', () => {
    // A high capture ratio that is normal for the mandate is not a finding —
    // an aggressive fund SHOULD fall harder than a broad index.
    expect(rule.evaluate(facts('1.22', '0.25'), SCHEME)).toEqual([]);
  });

  it('names the threshold in whatWouldChangeThis', () => {
    const finding = rule.evaluate(facts('1.22', '0.12'), SCHEME)[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('1.10');
  });

  it('is silent when no horizon has a benchmark to compute capture against', () => {
    const metrics: Partial<Record<MfHorizonKey, Partial<MfHorizonMetrics>>> = {};
    for (const key of ALL_HORIZONS) {
      metrics[key] = relativeRow(Number(key) as 1 | 3 | 5 | 7 | 10, null, {
        'relative.downCapture': 'BENCHMARK_UNAVAILABLE',
      });
    }
    const missing = makeFacts({
      funds: { [SCHEME]: makeFundFacts({ metrics }) },
    });
    expect(rule.evaluate(missing, SCHEME)).toEqual([]);
  });

  it('is silent when the metric is present but its status is not OK', () => {
    const quarantined = makeFacts({
      funds: {
        [SCHEME]: makeFundFacts({
          metrics: {
            '10': relativeRow(10, '1.22', { 'relative.downCapture': 'QUARANTINED' }),
          },
          peer: { '10': makePeer({ downCapture: '0.12' }, { downCapture: '0.95' }) },
        }),
      },
    });
    // It must not fall back to a shorter horizon and report a number the
    // fixture never claimed: the other rows sit at 0.918 / percentile 0.60.
    expect(rule.evaluate(quarantined, SCHEME)).toEqual([]);
  });
});
