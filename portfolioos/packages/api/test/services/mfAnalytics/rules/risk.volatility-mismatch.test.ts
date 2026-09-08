/**
 * `mf.risk.volatility-mismatch` (`05 §4` row 6, `05 §8.1`).
 *
 * Two things are pinned here beyond the usual boundary pair:
 *
 *  1. **MODERATE resolves to BALANCED.** `05 §4` says "user risk profile <=
 *     MODERATE"; this codebase's scale is CONSERVATIVE / BALANCED / GROWTH /
 *     AGGRESSIVE. The rule fires for the first two and not the last two, and
 *     the cases below assert all four so a future "let's add MODERATE" change
 *     has to confront them.
 *  2. **The percentile is inverted exactly once.** `stdDevAnn`'s stored
 *     percentile is higher = calmer; this rule's constant is written
 *     higher = riskier. A stored 0.20 is a riskiness of 0.80 and fires; a
 *     stored 0.80 is a riskiness of 0.20 and must not.
 */

import { describe, expect, it } from 'vitest';
import { serializeRatio, type MfHorizonMetrics, type MfMetricStatus } from '@portfolioos/shared';
import { riskVolatilityMismatchRule as rule } from '../../../../src/services/mfAnalytics/rules/risk.volatility-mismatch.js';
import type { MfHorizonKey } from '../../../../src/services/mfAnalytics/types.js';
import type { RiskCategoryValue } from '../../../../src/services/riskProfileMath.js';
import {
  SCHEME,
  makeFacts,
  makeFundFacts,
  makeMetricsRow,
  makePeer,
  makeRiskProfile,
} from './_facts.fixture.js';

const ALL_HORIZONS: readonly MfHorizonKey[] = ['1', '3', '5', '7', '10'];

function riskRow(
  horizon: 1 | 3 | 5 | 7 | 10,
  stdDevAnn: string | null,
  fieldStatus?: Record<string, MfMetricStatus>,
): Partial<MfHorizonMetrics> {
  const base = makeMetricsRow(horizon);
  return {
    risk: { ...base.risk, stdDevAnn: stdDevAnn === null ? null : serializeRatio(stdDevAnn) },
    ...(fieldStatus === undefined ? {} : { fieldStatus }),
  };
}

/** `storedPercentile` is the layer's normalised value: higher = calmer. */
function facts(category: RiskCategoryValue | null, storedPercentile: string) {
  return makeFacts({
    riskProfile: category === null ? null : makeRiskProfile(category),
    funds: {
      [SCHEME]: makeFundFacts({
        metrics: { '10': riskRow(10, '0.245') },
        peer: {
          '10': makePeer({ stdDevAnn: storedPercentile }, { stdDevAnn: '0.140000' }),
        },
      }),
    },
  });
}

describe('mf.risk.volatility-mismatch', () => {
  it('fires for a BALANCED profile against a top-riskiness-quartile fund', () => {
    // Stored 0.20 -> riskiness 0.80 > the 0.75 floor.
    const found = rule.evaluate(facts('BALANCED', '0.20'), SCHEME);

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('RISK_PROFILE_MISMATCH');
    expect(finding.severity).toBe('WARNING');
    expect(finding.category).toBe('RISK');
    expect(finding.headline).toContain('BALANCED');
  });

  it('fires for CONSERVATIVE too — the other half of "<= MODERATE"', () => {
    expect(rule.evaluate(facts('CONSERVATIVE', '0.20'), SCHEME)).toHaveLength(1);
  });

  it('does not fire for GROWTH or AGGRESSIVE — the volatility is what they asked for', () => {
    expect(rule.evaluate(facts('GROWTH', '0.20'), SCHEME)).toEqual([]);
    expect(rule.evaluate(facts('AGGRESSIVE', '0.20'), SCHEME)).toEqual([]);
  });

  it('does not fire one notch below the riskiness floor', () => {
    // Stored 0.25 -> riskiness exactly 0.75, and `05 §4` says "> 0.75".
    expect(rule.evaluate(facts('BALANCED', '0.25'), SCHEME)).toEqual([]);
  });

  it('does not invert the percentile twice — a calm fund never fires', () => {
    // Stored 0.80 is one of the CALMEST funds in its category.
    expect(rule.evaluate(facts('BALANCED', '0.80'), SCHEME)).toEqual([]);
  });

  it('names the threshold in whatWouldChangeThis', () => {
    const finding = rule.evaluate(facts('BALANCED', '0.20'), SCHEME)[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    // The riskiest 25% — the complement of the 0.75 floor.
    expect(finding.whatWouldChangeThis).toContain('25%');
    expect(finding.whatWouldChangeThis).toContain('AGGRESSIVE');
  });

  it('is silent when there is no risk assessment on file', () => {
    // "No profile" is not "assume conservative".
    expect(rule.evaluate(facts(null, '0.20'), SCHEME)).toEqual([]);
  });

  it('is silent when volatility is unavailable rather than high', () => {
    const missing: Partial<Record<MfHorizonKey, Partial<MfHorizonMetrics>>> = {};
    for (const key of ALL_HORIZONS) {
      missing[key] = riskRow(Number(key) as 1 | 3 | 5 | 7 | 10, null, {
        'risk.stdDevAnn': 'INSUFFICIENT_DATA',
      });
    }
    const noVol = makeFacts({
      riskProfile: makeRiskProfile('BALANCED'),
      funds: {
        [SCHEME]: makeFundFacts({
          metrics: missing,
          peer: {
            '1': makePeer({ stdDevAnn: '0.20' }),
            '3': makePeer({ stdDevAnn: '0.20' }),
            '5': makePeer({ stdDevAnn: '0.20' }),
            '7': makePeer({ stdDevAnn: '0.20' }),
            '10': makePeer({ stdDevAnn: '0.20' }),
          },
        }),
      },
    });
    expect(rule.evaluate(noVol, SCHEME)).toEqual([]);
  });
});
