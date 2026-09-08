/**
 * `mf.portfolio.concentration` (`05 §4` row 9, `05 §8.1`).
 *
 * The mandate exclusions carry as much weight as the threshold: a Focused Fund
 * is capped at 30 holdings by SEBI and a Sectoral/Thematic fund is 80% in one
 * theme by mandate, so flagging either for concentration would be telling the
 * holder that the product does what it says on the tin.
 */

import { describe, expect, it } from 'vitest';
import { serializePct, type MfMetricStatus } from '@portfolioos/shared';
import { portfolioConcentrationRule as rule } from '../../../../src/services/mfAnalytics/rules/portfolio.concentration.js';
import { SCHEME, makeFacts, makeFundFacts } from './_facts.fixture.js';

function facts(options: {
  top10WeightPct: string | null;
  sebiSubCategory?: string;
  fieldStatus?: Record<string, MfMetricStatus>;
}) {
  return makeFacts({
    funds: {
      [SCHEME]: makeFundFacts({
        meta:
          options.sebiSubCategory === undefined
            ? {}
            : // Cast through the DTO's own union; the fixture keeps the value
              // honest by typing `meta` as `Partial<MfSchemeMetaDto>`.
              { sebiSubCategory: options.sebiSubCategory as 'Large Cap Fund' },
        profile: {
          top10WeightPct:
            options.top10WeightPct === null ? null : serializePct(options.top10WeightPct),
          ...(options.fieldStatus === undefined ? {} : { fieldStatus: options.fieldStatus }),
        },
      }),
    },
  });
}

describe('mf.portfolio.concentration', () => {
  it('fires for a diversified mandate whose top 10 exceed the threshold', () => {
    const found = rule.evaluate(facts({ top10WeightPct: '68.400000' }), SCHEME);

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('CONCENTRATED_PORTFOLIO');
    expect(finding.severity).toBe('NOTICE');
    expect(finding.category).toBe('PORTFOLIO');
    expect(finding.headline).toContain('68.4%');
  });

  it('does not fire at the threshold exactly', () => {
    // `05 §4` says "> 60".
    expect(rule.evaluate(facts({ top10WeightPct: '60.000000' }), SCHEME)).toEqual([]);
  });

  it('does not fire for a Focused Fund — SEBI caps it at 30 holdings', () => {
    expect(
      rule.evaluate(
        facts({ top10WeightPct: '68.400000', sebiSubCategory: 'Focused Fund' }),
        SCHEME,
      ),
    ).toEqual([]);
  });

  it('does not fire for a Sectoral/Thematic Fund — concentration is the product', () => {
    expect(
      rule.evaluate(
        facts({ top10WeightPct: '68.400000', sebiSubCategory: 'Sectoral/Thematic Fund' }),
        SCHEME,
      ),
    ).toEqual([]);
  });

  it('does not fire for an UNMAPPED sub-category — we cannot name the mandate', () => {
    expect(
      rule.evaluate(facts({ top10WeightPct: '68.400000', sebiSubCategory: 'UNMAPPED' }), SCHEME),
    ).toEqual([]);
  });

  it('names the threshold in whatWouldChangeThis', () => {
    const finding = rule.evaluate(facts({ top10WeightPct: '68.400000' }), SCHEME)[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('60%');
  });

  it('is silent when the top-10 weight is unavailable', () => {
    expect(rule.evaluate(facts({ top10WeightPct: null }), SCHEME)).toEqual([]);

    const notOk = facts({
      top10WeightPct: '68.400000',
      fieldStatus: { top10WeightPct: 'INSUFFICIENT_DATA' },
    });
    expect(rule.evaluate(notOk, SCHEME)).toEqual([]);
  });
});
