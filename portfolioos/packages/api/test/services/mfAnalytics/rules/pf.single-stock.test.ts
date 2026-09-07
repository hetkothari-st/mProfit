/**
 * `mf.pf.single-stock` — `LOOK_THROUGH_CONCENTRATION`.
 *
 * Beyond the fire / no-fire boundary, this suite pins the two *floor*
 * conditions, because they are the ones a reader would otherwise not know
 * about: a fund with no usable portfolio disclosure contributes none of its
 * stocks to the sum, and a restricted family view contributes none of the
 * household's hidden funds. In both cases the effective weight is a lower
 * bound and the finding has to say so.
 */

import { describe, it, expect } from 'vitest';
import { serializePct } from '@portfolioos/shared';

import { pfSingleStockRule } from '../../../../src/services/mfAnalytics/rules/pf.single-stock.js';
import { MF_HEADLINE_MAX_CHARS } from '../../../../src/services/mfAnalytics/types.js';
import {
  makeLookThrough,
  makeLookThroughStock,
  makePartialScope,
  makePortfolioFacts,
  type PortfolioFactsOptions,
} from './_portfolio.fixture.js';

function factsWithStocks(
  stocks: ReturnType<typeof makeLookThroughStock>[],
  lookThroughExtra: Parameters<typeof makeLookThrough>[0] = {},
  extra: PortfolioFactsOptions = {},
) {
  return makePortfolioFacts({
    ...extra,
    portfolio: {
      lookThrough: makeLookThrough({ topStocks: stocks, ...lookThroughExtra }),
      ...(extra.portfolio ?? {}),
    },
  });
}

describe('mf.pf.single-stock', () => {
  it('is a portfolio-scope rule in the PORTFOLIO category', () => {
    expect(pfSingleStockRule.id).toBe('mf.pf.single-stock');
    expect(pfSingleStockRule.scope).toBe('PORTFOLIO');
    expect(pfSingleStockRule.category).toBe('PORTFOLIO');
  });

  it('fires when one underlying stock is above 5% of the MF book', () => {
    const facts = factsWithStocks([
      makeLookThroughStock({
        securityName: 'HDFC Bank Ltd',
        effectiveWeightPct: serializePct('7.400000'),
        contributors: [
          { schemeCode: 'PF_1', schemeName: 'Fund 1', weightPct: serializePct('9.100000') },
          { schemeCode: 'PF_2', schemeName: 'Fund 2', weightPct: serializePct('8.200000') },
        ],
      }),
    ]);

    const findings = pfSingleStockRule.evaluate(facts);

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe('LOOK_THROUGH_CONCENTRATION');
    expect(finding.severity).toBe('NOTICE');
    expect(finding.category).toBe('PORTFOLIO');
    expect(finding.schemeCode).toBeNull();
    expect(finding.headline).toContain('HDFC Bank Ltd');
    expect(finding.headline).toContain('7.4%');
    // Complete book: not a floor, so no hedging language.
    expect(finding.headline).not.toContain('at least');
    expect(finding.headline.length).toBeLessThanOrEqual(MF_HEADLINE_MAX_CHARS);
  });

  it('does not fire one notch below the threshold', () => {
    // The trigger is "> 5%", so 5% exactly is clean.
    const facts = factsWithStocks([
      makeLookThroughStock({ effectiveWeightPct: serializePct('5.000000') }),
    ]);

    expect(pfSingleStockRule.evaluate(facts)).toEqual([]);
  });

  it('reads the ceiling from facts.constants', () => {
    const facts = factsWithStocks(
      [makeLookThroughStock({ effectiveWeightPct: serializePct('7.400000') })],
      {},
      { constants: { lookThroughSingleStockPct: 10 } },
    );

    expect(pfSingleStockRule.evaluate(facts)).toEqual([]);
  });

  it('stays silent when no look-through has been computed', () => {
    // No snapshots loaded is a missing input, not a clean portfolio.
    expect(pfSingleStockRule.evaluate(factsWithStocks([]))).toEqual([]);
  });

  it('names the threshold in whatWouldChangeThis', () => {
    const facts = factsWithStocks([
      makeLookThroughStock({ effectiveWeightPct: serializePct('6.200000') }),
    ]);

    const finding = pfSingleStockRule.evaluate(facts)[0]!;

    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('5%');
    expect(finding.whatWouldChangeThis).toContain('6.2%');
  });

  it('calls the weight a floor when a held fund has no usable disclosure', () => {
    const facts = factsWithStocks(
      [makeLookThroughStock({ effectiveWeightPct: serializePct('6.200000') })],
      { fundsWithoutHoldings: ['PF_9', 'PF_10'] },
    );

    const finding = pfSingleStockRule.evaluate(facts)[0]!;

    // Two funds' stocks are missing from the sum entirely, so the true weight
    // can only be higher than the one cited.
    expect(finding.headline).toContain('at least 6.2%');
    expect(finding.whatWouldChangeThis).toContain('floor');
    expect(
      finding.evidence.some((e) => e.metric === 'lookThrough.fundsWithoutHoldings.count'),
    ).toBe(true);
  });

  it('calls the weight a floor under a partial family scope', () => {
    const facts = factsWithStocks(
      [makeLookThroughStock({ effectiveWeightPct: serializePct('6.200000') })],
      {},
      { portfolio: { scope: makePartialScope() } },
    );

    const finding = pfSingleStockRule.evaluate(facts)[0]!;

    expect(finding.headline).toContain('at least');
    expect(finding.whatWouldChangeThis).toContain('floor');
    expect(finding.evidence.some((e) => e.label.includes('floor'))).toBe(true);
  });

  it('emits one finding for the worst stock however many breach', () => {
    const facts = factsWithStocks([
      makeLookThroughStock({
        securityName: 'Alpha Ltd',
        effectiveWeightPct: serializePct('5.500000'),
      }),
      makeLookThroughStock({
        securityName: 'Beta Ltd',
        effectiveWeightPct: serializePct('9.900000'),
      }),
    ]);

    const findings = pfSingleStockRule.evaluate(facts);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.headline).toContain('Beta Ltd');
    expect(findings[0]!.headline).toContain('(+1 more)');
  });
});
