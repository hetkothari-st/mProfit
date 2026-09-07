/**
 * `mf.perf.recent-reversal` (`05 §4` row 3, `05 §8.1`).
 *
 * The rule is symmetric — `05 §4`'s "(or vice versa)" — so both directions get
 * a firing case. A test that only covered the long-strong/short-weak direction
 * would pass against an implementation that had silently dropped half the rule.
 */

import { describe, expect, it } from 'vitest';
import { serializeRatio } from '@portfolioos/shared';
import { perfRecentReversalRule as rule } from '../../../../src/services/mfAnalytics/rules/perf.recent-reversal.js';
import { SCHEME, makeFacts, makeFundFacts, makePeer } from './_facts.fixture.js';

function facts(longPct: string | null, shortPct: string | null) {
  return makeFacts({
    funds: {
      [SCHEME]: makeFundFacts({
        peer: {
          // The 1-year row ranks `absolute`: SEBI mandates an absolute figure
          // under a year and `cagr` is null there (`02 §9`).
          '1': shortPct === null ? makePeer({}, {}) : makePeer({ absolute: shortPct }),
          '10': longPct === null ? makePeer({}, {}) : makePeer({ cagr: longPct }),
        },
      }),
    },
  });
}

describe('mf.perf.recent-reversal', () => {
  it('fires when a strong 10-year record is paired with a weak last year', () => {
    const found = rule.evaluate(facts('0.82', '0.18'), SCHEME);

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('RECENT_REVERSAL');
    expect(finding.severity).toBe('NOTICE');
    expect(finding.category).toBe('PERFORMANCE');
    expect(finding.headline).toContain('over the last year');
  });

  it('fires in the other direction too — a hot year against a weak decade', () => {
    const found = rule.evaluate(facts('0.20', '0.90'), SCHEME);

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('RECENT_REVERSAL');
    // Headline leads with the recent number when that is the strong end.
    expect(found[0]!.headline.startsWith('Ranked 90th percentile over the last year')).toBe(true);
  });

  it('does not fire one notch below the long-horizon floor', () => {
    // 0.74 < 0.75: the two ends no longer disagree strongly enough.
    expect(rule.evaluate(facts('0.74', '0.18'), SCHEME)).toEqual([]);
  });

  it('does not fire one notch above the short-horizon ceiling', () => {
    expect(rule.evaluate(facts('0.82', '0.26'), SCHEME)).toEqual([]);
  });

  it('names both thresholds in whatWouldChangeThis', () => {
    const finding = rule.evaluate(facts('0.82', '0.18'), SCHEME)[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('25');
    expect(finding.whatWouldChangeThis).toContain('75');
  });

  it('is silent when either end of the comparison is unranked', () => {
    // A reversal is a claim about two numbers. With one absent there is no
    // claim — not a claim with a null in it.
    expect(rule.evaluate(facts(null, '0.18'), SCHEME)).toEqual([]);
    expect(rule.evaluate(facts('0.82', null), SCHEME)).toEqual([]);

    const noPeerRow = makeFacts({
      funds: { [SCHEME]: makeFundFacts({ peer: { '10': null } }) },
    });
    expect(rule.evaluate(noPeerRow, SCHEME)).toEqual([]);
  });

  it('emits a confidence of 1.0 — the claim rests on ten years of ranks', () => {
    expect(rule.evaluate(facts('0.82', '0.18'), SCHEME)[0]!.confidence).toBe(serializeRatio('1'));
  });
});
