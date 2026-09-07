/**
 * `mf.perf.top-quartile-consistency` (`05 §4` row 2, `05 §8.1`).
 *
 * Note the horizon semantics asserted below: the rule reads the LONGEST
 * horizon that carries a usable `quartileConsistency` and tests that one. It
 * does not fall back to a shorter, kinder window when the long record fails —
 * a ten-year record that says 0.79 is the answer, not a reason to go looking
 * for a five-year one that says 0.85.
 */

import { describe, expect, it } from 'vitest';
import { serializeRatio, type MfHorizonMetrics } from '@portfolioos/shared';
import { perfTopQuartileConsistencyRule as rule } from '../../../../src/services/mfAnalytics/rules/perf.top-quartile-consistency.js';
import {
  SCHEME,
  makeFacts,
  makeFundFacts,
  makeMetricsRow,
} from './_facts.fixture.js';

function consistencyRow(
  horizon: 1 | 3 | 5 | 7 | 10,
  over: { quartileConsistency?: string | null; rollingBeatBenchPct?: string | null },
): Partial<MfHorizonMetrics> {
  const base = makeMetricsRow(horizon);
  return {
    consistency: {
      ...base.consistency,
      ...(over.quartileConsistency === undefined
        ? {}
        : {
            quartileConsistency:
              over.quartileConsistency === null
                ? null
                : serializeRatio(over.quartileConsistency),
          }),
      ...(over.rollingBeatBenchPct === undefined
        ? {}
        : {
            rollingBeatBenchPct:
              over.rollingBeatBenchPct === null
                ? null
                : serializeRatio(over.rollingBeatBenchPct),
          }),
    },
  };
}

function facts(options: {
  quartileConsistency10y: string | null;
  rollingBeat3y: string;
  tenYearStatus?: Record<string, 'INSUFFICIENT_DATA'>;
}) {
  return makeFacts({
    funds: {
      [SCHEME]: makeFundFacts({
        metrics: {
          '3': consistencyRow(3, { rollingBeatBenchPct: options.rollingBeat3y }),
          '10': {
            ...consistencyRow(10, { quartileConsistency: options.quartileConsistency10y }),
            ...(options.tenYearStatus === undefined
              ? {}
              : { fieldStatus: options.tenYearStatus }),
          },
        },
      }),
    },
  });
}

describe('mf.perf.top-quartile-consistency', () => {
  it('fires for a fund consistently in the category top half and ahead of its benchmark', () => {
    const found = rule.evaluate(
      facts({ quartileConsistency10y: '0.85', rollingBeat3y: '0.78' }),
      SCHEME,
    );

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('CONSISTENT_OUTPERFORMER');
    // The one piece of good news in the catalogue is INFO, never a WARNING.
    expect(finding.severity).toBe('INFO');
    expect(finding.category).toBe('PERFORMANCE');
    // Ten years of evidence: `05 §4`'s confidence scale tops out at 1.0.
    expect(finding.confidence).toBe(serializeRatio('1'));
  });

  it('does not fire one notch below the consistency floor', () => {
    // 0.79 < 0.80. The claim is "consistently top half", and 0.79 is not it.
    expect(
      rule.evaluate(facts({ quartileConsistency10y: '0.79', rollingBeat3y: '0.78' }), SCHEME),
    ).toEqual([]);
  });

  it('does not fire one notch below the benchmark-beat floor', () => {
    expect(
      rule.evaluate(facts({ quartileConsistency10y: '0.85', rollingBeat3y: '0.69' }), SCHEME),
    ).toEqual([]);
  });

  it('names both thresholds in whatWouldChangeThis', () => {
    const finding = rule.evaluate(
      facts({ quartileConsistency10y: '0.85', rollingBeat3y: '0.78' }),
      SCHEME,
    )[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('80%');
    expect(finding.whatWouldChangeThis).toContain('70%');
  });

  it('is silent when the long-horizon consistency figure is unavailable', () => {
    // Every horizon at or above `consistentOutperformerMinYears` must be
    // unusable for the rule to have nothing to read; the fixture's default 5y
    // and 7y rows sit at 0.60, which is below the floor and so silent anyway.
    const missing = makeFacts({
      funds: {
        [SCHEME]: makeFundFacts({
          metrics: {
            '3': consistencyRow(3, { rollingBeatBenchPct: '0.78' }),
            '5': { ...consistencyRow(5, { quartileConsistency: null }), fieldStatus: { 'consistency.quartileConsistency': 'INSUFFICIENT_DATA' } },
            '7': { ...consistencyRow(7, { quartileConsistency: null }), fieldStatus: { 'consistency.quartileConsistency': 'INSUFFICIENT_DATA' } },
            '10': { ...consistencyRow(10, { quartileConsistency: null }), fieldStatus: { 'consistency.quartileConsistency': 'INSUFFICIENT_DATA' } },
          },
        }),
      },
    });
    expect(rule.evaluate(missing, SCHEME)).toEqual([]);
  });

  it('is silent when the 3-year benchmark-beat row is missing entirely', () => {
    const missing = makeFacts({
      funds: {
        [SCHEME]: makeFundFacts({
          metrics: {
            '3': null,
            '10': consistencyRow(10, { quartileConsistency: '0.85' }),
          },
        }),
      },
    });
    expect(rule.evaluate(missing, SCHEME)).toEqual([]);
  });
});
