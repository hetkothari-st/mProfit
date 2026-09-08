/**
 * `mf.perf.persistent-underperformance` (`05 §4` row 1, `05 §8.1`).
 *
 * The boundary cases are the point of this file. A rule that fires is easy to
 * write and easy to write wrongly; what proves the threshold sits where the
 * doc says is the case one notch *below* it that stays silent.
 */

import { describe, expect, it } from 'vitest';
import { serializeRatio, type MfHorizonMetrics } from '@portfolioos/shared';
import { perfPersistentUnderperformanceRule as rule } from '../../../../src/services/mfAnalytics/rules/perf.persistent-underperformance.js';
import {
  SCHEME,
  makeFacts,
  makeFundFacts,
  makeMetricsRow,
  makeScore,
} from './_facts.fixture.js';

/** Overrides on the 3-year row's consistency block, leaving the rest intact. */
function consistency(rollingBeatBenchPct: string | null): Partial<MfHorizonMetrics> {
  const base = makeMetricsRow(3);
  return {
    consistency: {
      ...base.consistency,
      rollingBeatBenchPct: rollingBeatBenchPct === null ? null : serializeRatio(rollingBeatBenchPct),
    },
  };
}

function facts(options: {
  rollingBeat: string | null;
  performancePillar: string | null;
  fieldStatus?: Record<string, 'BENCHMARK_UNAVAILABLE' | 'NOT_APPLICABLE'>;
}) {
  const base = makeScore();
  return makeFacts({
    funds: {
      [SCHEME]: makeFundFacts({
        metrics: {
          '3': {
            ...consistency(options.rollingBeat),
            ...(options.fieldStatus === undefined ? {} : { fieldStatus: options.fieldStatus }),
          },
        },
        score: makeScore({
          pillars: {
            ...base.pillars,
            PERFORMANCE: {
              score:
                options.performancePillar === null
                  ? null
                  : serializeRatio(options.performancePillar),
              weight: serializeRatio('0.300000'),
              inputs: {},
            },
          },
        }),
      }),
    },
  });
}

describe('mf.perf.persistent-underperformance', () => {
  it('fires when the fund trails its benchmark AND its category on performance', () => {
    const found = rule.evaluate(facts({ rollingBeat: '0.22', performancePillar: '0.18' }), SCHEME);

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('PERSISTENT_UNDERPERFORMANCE');
    expect(finding.severity).toBe('WARNING');
    expect(finding.category).toBe('PERFORMANCE');
    expect(finding.schemeCode).toBe(SCHEME);
    // 3-year evidence only: `05 §4`'s confidence scale puts that at 0.7.
    expect(finding.confidence).toBe(serializeRatio('0.7'));
  });

  it('does not fire one notch below the rolling-beat floor', () => {
    // 0.30 exactly is NOT below 0.30. The doc's trigger is strict.
    expect(rule.evaluate(facts({ rollingBeat: '0.30', performancePillar: '0.18' }), SCHEME)).toEqual(
      [],
    );
  });

  it('does not fire one notch below the pillar-percentile ceiling', () => {
    // Trailing the benchmark while still ranking mid-pack in the category is a
    // fact about the category, not about the manager — see the rule header.
    expect(rule.evaluate(facts({ rollingBeat: '0.22', performancePillar: '0.25' }), SCHEME)).toEqual(
      [],
    );
  });

  it('names the threshold in whatWouldChangeThis', () => {
    const finding = rule.evaluate(
      facts({ rollingBeat: '0.22', performancePillar: '0.18' }),
      SCHEME,
    )[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    // The floor is 0.30, rendered as a percentage.
    expect(finding.whatWouldChangeThis).toContain('30%');
  });

  it('is silent when the rolling-beat metric is unavailable rather than low', () => {
    const missing = facts({
      rollingBeat: null,
      performancePillar: '0.18',
      fieldStatus: { 'consistency.rollingBeatBenchPct': 'BENCHMARK_UNAVAILABLE' },
    });
    expect(rule.evaluate(missing, SCHEME)).toEqual([]);

    // And a NOT_APPLICABLE status must not be read as "a low number" either,
    // even when a value happens to sit beside it.
    const notApplicable = facts({
      rollingBeat: '0.22',
      performancePillar: '0.18',
      fieldStatus: { 'consistency.rollingBeatBenchPct': 'NOT_APPLICABLE' },
    });
    expect(rule.evaluate(notApplicable, SCHEME)).toEqual([]);
  });

  it('is silent when the fund has no PERFORMANCE pillar score', () => {
    expect(rule.evaluate(facts({ rollingBeat: '0.22', performancePillar: null }), SCHEME)).toEqual(
      [],
    );
  });

  it('is silent for an unknown scheme or a portfolio-scope call', () => {
    const base = facts({ rollingBeat: '0.22', performancePillar: '0.18' });
    expect(rule.evaluate(base, 'NO_SUCH_SCHEME')).toEqual([]);
    expect(rule.evaluate(base)).toEqual([]);
  });
});
