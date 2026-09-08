/**
 * `mf.portfolio.style-drift` (`05 §4` row 10, `05 §8.1`).
 *
 * Two properties are worth more than the firing case here:
 *
 *  1. **The band is regulation.** It comes from `SEBI_SUBCATEGORY_MAP`, not
 *     from `MfRuleConstants`, so a fixture cannot move it. The Large Cap floor
 *     asserted below is the SEBI circular's 80%.
 *  2. **Mandates with no cap-bucket floor never fire.** Flexi Cap has only a
 *     `minEquityPct`, and going anywhere across the cap spectrum is the point
 *     of it; Dynamic Bond and Balanced Advantage carry no `capBand` at all.
 */

import { describe, expect, it } from 'vitest';
import { serializePct, serializeRatio, type MfMetricStatus } from '@portfolioos/shared';
import { portfolioStyleDriftRule as rule } from '../../../../src/services/mfAnalytics/rules/portfolio.style-drift.js';
import { SCHEME, makeFacts, makeFundFacts, makeProfile } from './_facts.fixture.js';

function facts(options: {
  largePct: string;
  styleDrift: string | null;
  sebiSubCategory?: string;
  fieldStatus?: Record<string, MfMetricStatus>;
}) {
  const base = makeProfile();
  return makeFacts({
    funds: {
      [SCHEME]: makeFundFacts({
        meta:
          options.sebiSubCategory === undefined
            ? {}
            : { sebiSubCategory: options.sebiSubCategory as 'Large Cap Fund' },
        profile: {
          marketCapSplit: {
            ...base.marketCapSplit!,
            large: serializePct(options.largePct),
          },
          styleDrift: options.styleDrift === null ? null : serializeRatio(options.styleDrift),
          ...(options.fieldStatus === undefined ? {} : { fieldStatus: options.fieldStatus }),
        },
      }),
    },
  });
}

describe('mf.portfolio.style-drift', () => {
  it('fires when the latest disclosure sits below the SEBI cap floor', () => {
    // Large Cap Fund is mandated at >= 80% large caps; the fund holds 71.2%,
    // and `styleDrift` confirms it was outside the band across the lookback.
    const found = rule.evaluate(facts({ largePct: '71.200000', styleDrift: '8.800000' }), SCHEME);

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('STYLE_DRIFT');
    expect(finding.severity).toBe('WARNING');
    expect(finding.category).toBe('PORTFOLIO');
    expect(finding.headline).toContain('80% SEBI floor');
  });

  it('does not fire at the mandated floor exactly', () => {
    // 80% is compliance. Drift is one-sided by band edge (`02 §7`).
    expect(rule.evaluate(facts({ largePct: '80.000000', styleDrift: '8.800000' }), SCHEME)).toEqual(
      [],
    );
  });

  it('does not fire above the floor, however far above', () => {
    // Holding MORE large cap than mandated is not drift.
    expect(rule.evaluate(facts({ largePct: '95.000000', styleDrift: '8.800000' }), SCHEME)).toEqual(
      [],
    );
  });

  it('does not fire for Flexi Cap — no cap-bucket floor exists to breach', () => {
    expect(
      rule.evaluate(
        { ...facts({ largePct: '30.000000', styleDrift: '8.800000', sebiSubCategory: 'Flexi Cap Fund' }) },
        SCHEME,
      ),
    ).toEqual([]);
  });

  it('does not fire for Balanced Advantage or Dynamic Bond — no capBand at all', () => {
    for (const sub of ['Dynamic Asset Allocation or Balanced Advantage Fund', 'Dynamic Bond Fund']) {
      expect(
        rule.evaluate(
          facts({ largePct: '5.000000', styleDrift: '8.800000', sebiSubCategory: sub }),
          SCHEME,
        ),
      ).toEqual([]);
    }
  });

  it('names both the mandated floor and the month count in whatWouldChangeThis', () => {
    const finding = rule.evaluate(
      facts({ largePct: '71.200000', styleDrift: '8.800000' }),
      SCHEME,
    )[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('80%');
    expect(finding.whatWouldChangeThis).toContain('3 consecutive months');
  });

  it('is silent when styleDrift is unavailable — which is production today', () => {
    // `mfMetrics.service.ts` sets `styleDrift` to null with reason `no_data`
    // for every fund, because the SEBI bands were never wired into the metrics
    // layer. This rule therefore emits nothing in production, and that is the
    // honest state rather than a breach asserted against a band we never
    // measured.
    expect(rule.evaluate(facts({ largePct: '71.200000', styleDrift: null }), SCHEME)).toEqual([]);
  });

  it('is silent when the market-cap split could not be produced', () => {
    const noSplit = makeFacts({
      funds: {
        [SCHEME]: makeFundFacts({
          profile: {
            marketCapSplit: null,
            styleDrift: serializeRatio('8.800000'),
            fieldStatus: { marketCapSplit: 'INSUFFICIENT_DATA' },
          },
        }),
      },
    });
    expect(rule.evaluate(noSplit, SCHEME)).toEqual([]);
  });

  it('does not read an unclassified bucket as zero exposure', () => {
    // A null bucket is unknown, not empty. Treating it as 0 would manufacture
    // a 100pp breach for every fund whose small-cap sleeve was unclassifiable.
    const base = makeProfile();
    const unknownLarge = makeFacts({
      funds: {
        [SCHEME]: makeFundFacts({
          profile: {
            marketCapSplit: { ...base.marketCapSplit!, large: null },
            styleDrift: serializeRatio('8.800000'),
          },
        }),
      },
    });
    expect(rule.evaluate(unknownLarge, SCHEME)).toEqual([]);
  });
});
