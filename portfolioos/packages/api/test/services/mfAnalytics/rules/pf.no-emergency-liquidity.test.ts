/**
 * `mf.pf.no-emergency-liquidity` — `NO_LIQUID_BUFFER`.
 *
 * ⚠ **This rule cannot fire today, and the suite documents why rather than
 * pretending otherwise.**
 *
 * The finding needs two inputs: "no liquid or overnight fund in the MF book",
 * which `facts.portfolio.funds[].meta.sebiSubCategory` supplies, and "fewer
 * than N months of expenses covered", which `MfAnalysisFacts` does not carry
 * at all — there is no monthly expense figure and no cash balance in the
 * facts, and a rule may not go and fetch them (`05 §3`).
 *
 * So there is no fires-case to write. The alternative would be to invent a
 * proxy — `lookThrough.assetClass.cash` is a *share of the MF book*, not
 * months of expenses; `incomeKnown === false` is a licence to say "we cannot
 * size this", never to treat expenses as zero (`CONTEXT.md §6`) — and that
 * would produce a NOTICE telling a real person their emergency fund is short
 * on the strength of a number nobody computed.
 *
 * What the suite therefore pins is the shape of the silence: the rule is
 * silent *specifically* because the months-covered fact is missing, not
 * because the liquid-fund half is broken. The moment a months-covered figure
 * reaches the facts, `monthsCoveredFrom` stops returning null and the fire
 * cases below become writable — the comparison and the counterfactual are
 * already threshold-driven and already in place.
 */

import { describe, it, expect } from 'vitest';
import { serializePct } from '@portfolioos/shared';

import { pfNoEmergencyLiquidityRule } from '../../../../src/services/mfAnalytics/rules/pf.no-emergency-liquidity.js';
import {
  makeHeldFund,
  makeHeldFunds,
  makeLookThrough,
  makeMeta,
  makePartialScope,
  makePortfolioFacts,
} from './_portfolio.fixture.js';

describe('mf.pf.no-emergency-liquidity', () => {
  it('is a portfolio-scope rule in the ALLOCATION category', () => {
    expect(pfNoEmergencyLiquidityRule.id).toBe('mf.pf.no-emergency-liquidity');
    expect(pfNoEmergencyLiquidityRule.scope).toBe('PORTFOLIO');
    expect(pfNoEmergencyLiquidityRule.category).toBe('ALLOCATION');
  });

  it('is silent when a liquid fund is held — the buffer exists', () => {
    const facts = makePortfolioFacts({
      portfolio: {
        funds: [
          makeHeldFund({
            meta: makeMeta({ schemeCode: 'PF_LIQ', sebiSubCategory: 'Liquid Fund' }),
          }),
        ],
      },
    });

    expect(pfNoEmergencyLiquidityRule.evaluate(facts)).toEqual([]);
  });

  it('is silent when an overnight fund is held', () => {
    const facts = makePortfolioFacts({
      portfolio: {
        funds: [
          makeHeldFund({
            meta: makeMeta({ schemeCode: 'PF_ON', sebiSubCategory: 'Overnight Fund' }),
          }),
        ],
      },
    });

    expect(pfNoEmergencyLiquidityRule.evaluate(facts)).toEqual([]);
  });

  it('is silent with no liquid fund either, for want of a months-covered fact', () => {
    // THIS IS THE GAP. An all-equity book and no liquid fund is condition one
    // of two; condition two has no input in `MfAnalysisFacts`, so the rule
    // emits nothing. Holding no liquid fund is a preference until we know how
    // many months of expenses are covered, and we do not.
    const facts = makePortfolioFacts({ portfolio: { funds: makeHeldFunds(3) } });

    expect(pfNoEmergencyLiquidityRule.evaluate(facts)).toEqual([]);
  });

  it('does not fall back on the cash share of the MF book as a proxy', () => {
    const facts = makePortfolioFacts({
      portfolio: {
        funds: makeHeldFunds(3),
        // A book that is 90% "cash" says nothing about how long that cash
        // would last, because the expenses are not in the facts.
        lookThrough: makeLookThrough({
          assetClass: {
            CASH: serializePct('90.000000'),
            EQUITY: serializePct('10.000000'),
          },
        }),
      },
    });

    expect(pfNoEmergencyLiquidityRule.evaluate(facts)).toEqual([]);
  });

  it('does not treat an unknown income as a zero buffer', () => {
    // `incomeKnown: false` is the fixture default and is a licence to say "we
    // cannot size this for you", never to compute against ₹0 of expenses.
    const facts = makePortfolioFacts({ portfolio: { funds: makeHeldFunds(2) } });
    expect(facts.userProfile.incomeKnown).toBe(false);

    expect(pfNoEmergencyLiquidityRule.evaluate(facts)).toEqual([]);
  });

  it('is silent on an empty book', () => {
    // An empty book is not a book without a liquid fund; it is no book.
    const facts = makePortfolioFacts({ portfolio: { funds: [] } });

    expect(pfNoEmergencyLiquidityRule.evaluate(facts)).toEqual([]);
  });

  it('is silent under a partial family scope too', () => {
    // Under a restricted view the household may hold a liquid fund we were
    // never shown, which is a second reason not to assert a gap.
    const facts = makePortfolioFacts({
      portfolio: { funds: makeHeldFunds(3), scope: makePartialScope() },
    });

    expect(pfNoEmergencyLiquidityRule.evaluate(facts)).toEqual([]);
  });
});
