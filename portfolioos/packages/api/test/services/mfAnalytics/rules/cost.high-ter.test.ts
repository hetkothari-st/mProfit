/**
 * `mf.cost.high-ter` (`05 §4` row 7, `05 §8.1`).
 *
 * The direction case is the one that matters. `terPercentile` is normalised
 * higher = cheaper, so 0.12 means "costlier than 88% of the category". An
 * implementation that re-inverted it would flag the CHEAPEST quartile of every
 * category and look entirely plausible doing so.
 */

import { describe, expect, it } from 'vitest';
import { serializePct, serializeRatio, type MfMetricStatus } from '@portfolioos/shared';
import { costHighTerRule as rule } from '../../../../src/services/mfAnalytics/rules/cost.high-ter.js';
import { SCHEME, makeFacts, makeFundFacts } from './_facts.fixture.js';

function facts(options: {
  terPercentile: string | null;
  terPct?: string | null;
  terCategoryMedianPct?: string | null;
  fieldStatus?: Record<string, MfMetricStatus>;
}) {
  return makeFacts({
    funds: {
      [SCHEME]: makeFundFacts({
        profile: {
          terPercentile:
            options.terPercentile === null ? null : serializeRatio(options.terPercentile),
          terPct:
            options.terPct === undefined
              ? serializePct('1.850000')
              : options.terPct === null
                ? null
                : serializePct(options.terPct),
          terCategoryMedianPct:
            options.terCategoryMedianPct === undefined
              ? serializePct('1.200000')
              : options.terCategoryMedianPct === null
                ? null
                : serializePct(options.terCategoryMedianPct),
          ...(options.fieldStatus === undefined ? {} : { fieldStatus: options.fieldStatus }),
        },
      }),
    },
  });
}

describe('mf.cost.high-ter', () => {
  it('fires when the fund is in the costliest quartile of its category', () => {
    const found = rule.evaluate(facts({ terPercentile: '0.12' }), SCHEME);

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('HIGH_TER');
    expect(finding.severity).toBe('NOTICE');
    expect(finding.category).toBe('COST');
    // 1 - 0.12 = 0.88 -> costlier than 88% of the category.
    expect(finding.headline).toContain('costlier than 88% of the category');
    expect(finding.headline).toContain('TER of 1.85%');
  });

  it('does not fire at the percentile ceiling exactly', () => {
    // `05 §4` says "< 0.25". Sitting on the line is not below it.
    expect(rule.evaluate(facts({ terPercentile: '0.25' }), SCHEME)).toEqual([]);
  });

  it('does not re-invert the direction — a cheap fund never fires', () => {
    // 0.90 = cheaper than 90% of the category.
    expect(rule.evaluate(facts({ terPercentile: '0.90' }), SCHEME)).toEqual([]);
  });

  it('names the category median and the percentile threshold in whatWouldChangeThis', () => {
    const finding = rule.evaluate(facts({ terPercentile: '0.12' }), SCHEME)[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('1.20%');
    expect(finding.whatWouldChangeThis).toContain('0.25');
  });

  it('still names a threshold when the category median is unknown', () => {
    const finding = rule.evaluate(
      facts({ terPercentile: '0.12', terCategoryMedianPct: null }),
      SCHEME,
    )[0]!;
    expect(finding.whatWouldChangeThis).toContain('0.25');
  });

  it('is silent when the fund has no TER percentile', () => {
    expect(rule.evaluate(facts({ terPercentile: null }), SCHEME)).toEqual([]);
  });

  it('is silent when the percentile is present but not OK', () => {
    // A value beside a non-OK status is unavailable, not low.
    const notOk = facts({
      terPercentile: '0.12',
      fieldStatus: { terPercentile: 'STALE' },
    });
    expect(rule.evaluate(notOk, SCHEME)).toEqual([]);
  });

  it('is silent when the fund has no current profile at all', () => {
    const noProfile = makeFacts({
      funds: { [SCHEME]: makeFundFacts({ profile: null }) },
    });
    expect(rule.evaluate(noProfile, SCHEME)).toEqual([]);
  });
});
