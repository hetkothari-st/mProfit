import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { ADVISOR_TOOLS } from '../../../../src/ai/advisorTools.js';
import { ADVISOR_ASSET_BUCKETS } from '../../../../src/services/advisor/types.js';
import { resolveProduct } from '../../../../src/services/advisor/productResolution.js';
import { assertProseConsistency } from '../../../../src/services/advisor/proseConsistency.js';
import type { AdvisorFacts } from '../../../../src/services/advisor/types.js';

/**
 * The contract between the ranking, the tool the assistant calls, and the
 * guard on what the model may write. Each of these is a place where a fund
 * name could reach a client without the engine having chosen it.
 */

function emptyBuckets<T>(): Record<string, T[]> {
  return ADVISOR_ASSET_BUCKETS.reduce<Record<string, T[]>>((acc, b) => {
    acc[b] = [];
    return acc;
  }, {});
}

function facts(over: Partial<AdvisorFacts> = {}): AdvisorFacts {
  return {
    userId: 'u1',
    asOf: new Date('2026-09-21T00:00:00Z'),
    riskProfile: { assessmentId: 'a1', category: 'GROWTH', age: 34, taxSlabPct: 30, assessedAt: new Date() },
    modelPortfolio: { id: 'mp', versionId: 'mpv', version: 1, targets: [] },
    totalPortfolioValue: new Decimal(1_000_000),
    currentAllocation: [],
    holdings: [],
    goals: [],
    harvestCandidates: [],
    approvedProducts: emptyBuckets(),
    fallbackRankings: emptyBuckets(),
    fundRanking: {
      available: true,
      fallbackReason: null,
      methodologyVersionId: 'rmv1',
      methodologyVersion: 1,
      asOfDate: new Date('2026-09-20T00:00:00Z'),
      candidates: {
        ...emptyBuckets(),
        EQUITY_DOMESTIC: [
          {
            schemeCode: '120503',
            schemeName: 'Alpha Nifty 50 Index Fund - Direct Plan - Growth',
            amcName: 'Alpha',
            fundId: 'f1',
            score: 91,
            rankInBucket: 1,
            overlapPct: null,
            metrics: { trackingDifferencePct: -0.22 },
            dataGaps: [{ metric: 'ter', reason: 'ter_unavailable', weightReleased: 40 }],
          },
          {
            schemeCode: '120504',
            schemeName: 'Beta Nifty 50 Index Fund - Direct Plan - Growth',
            amcName: 'Beta',
            fundId: 'f2',
            score: 78,
            rankInBucket: 2,
            overlapPct: null,
            metrics: {},
            dataGaps: [],
          },
        ],
      },
      incumbents: {},
      selectionConfig: {
        incumbentRankBand: 5,
        hysteresisMarginPct: 5,
        hysteresisSnapshots: 3,
        maxAmcSharePct: 40,
        overlapPenaltyPerPct: 0.5,
        maxOverlapPct: 40,
      },
    },
    valueByAmc: {},
    liquidity: { liquidAssets: new Decimal(0), monthlyExpenses: null, emergencyFundTarget: null, surplusOverTarget: null },
    capitalGainsRates: { stcgEquityPct: 20, ltcgEquityPct: 12.5, ltcgOtherNonIndexedPct: 12.5, slabPct: 30 },
    defaultPortfolioId: 'p1',
    ...over,
  } as AdvisorFacts;
}

describe('assistant tool contract', () => {
  // The tool the model calls and the engine that answers it must stay one
  // shape. Renaming one without the other is how a model starts inventing.
  it('exposes get_recommended_funds and no longer exposes get_approved_products', () => {
    const names = ADVISOR_TOOLS.map((t) => t.name);
    expect(names).toContain('get_recommended_funds');
    expect(names).not.toContain('get_approved_products');
  });

  it('accepts exactly the advisor buckets, so the model cannot ask for a bucket the engine has never heard of', () => {
    const tool = ADVISOR_TOOLS.find((t) => t.name === 'get_recommended_funds')!;
    const props = tool.input_schema.properties as Record<string, { enum?: string[] }>;
    expect(props['bucket']?.enum).toEqual([...ADVISOR_ASSET_BUCKETS]);
  });

  it('tells the model in its description that it is the only source of fund names', () => {
    const tool = ADVISOR_TOOLS.find((t) => t.name === 'get_recommended_funds')!;
    expect(tool.description).toMatch(/ONLY SOURCE OF FUND NAMES/i);
  });
});

describe('resolveProduct precedence', () => {
  it('names the top-ranked fund from the methodology', () => {
    const resolved = resolveProduct('EQUITY_DOMESTIC', facts());
    expect(resolved?.product.label).toContain('Alpha Nifty 50');
    expect(resolved?.provenance.kind).toBe('RANKED_UNIVERSE');
    expect(resolved?.provenance.namedSchemeCode).toBe('120503');
  });

  it('carries the evidence that justifies the pick', () => {
    const evidence = resolveProduct('EQUITY_DOMESTIC', facts())?.provenance.selectionEvidence as
      | Record<string, unknown>
      | undefined;
    expect(evidence?.['rankInBucket']).toBe(1);
    expect(evidence?.['runnerUp']).toMatchObject({ schemeCode: '120504' });
    expect(evidence?.['dataGaps']).toHaveLength(1);
    expect(evidence?.['methodologyVersion']).toBe(1);
  });

  // An adviser's explicit list is a human decision and outranks the algorithm.
  it('lets an approved product override the ranking', () => {
    const withOverride = facts({
      approvedProducts: {
        ...emptyBuckets(),
        EQUITY_DOMESTIC: [
          { approvedProductId: 'ap1', fundId: 'f9', stockId: null, label: 'House Pick Fund', score: null },
        ],
      } as AdvisorFacts['approvedProducts'],
    });
    const resolved = resolveProduct('EQUITY_DOMESTIC', withOverride);
    expect(resolved?.provenance.kind).toBe('APPROVED_LIST');
    expect(resolved?.product.label).toBe('House Pick Fund');
  });

  it('names nothing when the ranking is unavailable', () => {
    const gated = facts({
      fundRanking: { ...facts().fundRanking, available: false, fallbackReason: 'no_risk_profile' },
    });
    expect(resolveProduct('EQUITY_DOMESTIC', gated)).toBeNull();
  });
});

describe('prose consistency on fund names', () => {
  const rationale = 'Start a ₹12,000 monthly SIP into Alpha Nifty 50 Index Fund - Direct Plan - Growth.';

  it('accepts prose that names the fund the engine chose', () => {
    const r = assertProseConsistency(
      rationale,
      'I would put ₹12,000 a month into Alpha Nifty 50 Index Fund - Direct Plan - Growth.',
      ['Alpha Nifty 50 Index Fund - Direct Plan - Growth'],
    );
    expect(r.ok).toBe(true);
  });

  // The failure this guard exists for: a real fund the model knows, that this
  // recommendation never chose. It reads exactly as authoritative.
  it('rejects a fund name nothing authorised', () => {
    const r = assertProseConsistency(
      rationale,
      'I would put ₹12,000 a month into HDFC Flexi Cap Fund instead.',
      ['Alpha Nifty 50 Index Fund - Direct Plan - Growth'],
    );
    expect(r.ok).toBe(false);
    expect(r.offending.join(' ')).toContain('HDFC Flexi Cap Fund');
  });

  it('still allows talking about categories', () => {
    const r = assertProseConsistency(rationale, 'A low-cost index fund is the right home for this.', []);
    expect(r.ok).toBe(true);
  });

  it('still rejects an invented figure', () => {
    const r = assertProseConsistency(rationale, 'Put ₹15,000 a month in.', []);
    expect(r.ok).toBe(false);
  });
});
