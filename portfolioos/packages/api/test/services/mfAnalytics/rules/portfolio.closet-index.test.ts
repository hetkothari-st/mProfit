/**
 * `mf.portfolio.closet-index` (`05 §4` row 11, `05 §8.1`).
 *
 * This rule is silent in production today because `activeShare` requires
 * benchmark constituent weights that no table in this repository carries, and
 * `mfMetrics.service.ts` sets it null with `BENCHMARK_UNAVAILABLE` for every
 * fund. The last case below pins that: the rule must stay silent rather than
 * substituting a proxy such as tracking error, which measures something else
 * and would turn a missing input into an accusation.
 */

import { describe, expect, it } from 'vitest';
import { serializeRatio, type MfMetricStatus } from '@portfolioos/shared';
import { portfolioClosetIndexRule as rule } from '../../../../src/services/mfAnalytics/rules/portfolio.closet-index.js';
import { SCHEME, makeFacts, makeFundFacts } from './_facts.fixture.js';

function facts(options: {
  activeShare: string | null;
  terPercentile: string | null;
  fieldStatus?: Record<string, MfMetricStatus>;
}) {
  return makeFacts({
    funds: {
      [SCHEME]: makeFundFacts({
        profile: {
          activeShare: options.activeShare === null ? null : serializeRatio(options.activeShare),
          terPercentile:
            options.terPercentile === null ? null : serializeRatio(options.terPercentile),
          ...(options.fieldStatus === undefined ? {} : { fieldStatus: options.fieldStatus }),
        },
      }),
    },
  });
}

describe('mf.portfolio.closet-index', () => {
  it('fires on low active share paired with an above-median fee', () => {
    const found = rule.evaluate(facts({ activeShare: '0.31', terPercentile: '0.30' }), SCHEME);

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('CLOSET_INDEX');
    expect(finding.severity).toBe('WARNING');
    expect(finding.category).toBe('PORTFOLIO');
    expect(finding.headline).toContain('Active share of 0.31');
  });

  it('does not fire at the active-share ceiling exactly', () => {
    expect(rule.evaluate(facts({ activeShare: '0.40', terPercentile: '0.30' }), SCHEME)).toEqual([]);
  });

  it('does not fire when the fee is at or below the category median', () => {
    // A tracker that charges like a tracker is doing its job. 0.50 is the
    // median; the rule needs the fund to be dearer than that.
    expect(rule.evaluate(facts({ activeShare: '0.31', terPercentile: '0.50' }), SCHEME)).toEqual([]);
  });

  it('names both thresholds in whatWouldChangeThis', () => {
    const finding = rule.evaluate(facts({ activeShare: '0.31', terPercentile: '0.30' }), SCHEME)[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('0.40');
    expect(finding.whatWouldChangeThis).toContain('0.50');
  });

  it('is silent when active share is unavailable — the production case', () => {
    const noBenchmark = facts({
      activeShare: null,
      terPercentile: '0.30',
      fieldStatus: { activeShare: 'BENCHMARK_UNAVAILABLE' },
    });
    expect(rule.evaluate(noBenchmark, SCHEME)).toEqual([]);
  });

  it('is silent when the TER percentile is unavailable', () => {
    expect(rule.evaluate(facts({ activeShare: '0.31', terPercentile: null }), SCHEME)).toEqual([]);
  });
});
