import { describe, it, expect } from 'vitest';
import { resolveProduct } from '../../../src/services/advisor/productResolution.js';
import { ADVISOR_ASSET_BUCKETS } from '../../../src/services/advisor/types.js';
import type {
  AdvisorAssetBucketValue,
  AdvisorProductFact,
} from '../../../src/services/advisor/types.js';

type ProductMap = Record<AdvisorAssetBucketValue, AdvisorProductFact[]>;

function emptyMap(): ProductMap {
  return Object.fromEntries(ADVISOR_ASSET_BUCKETS.map((b) => [b, []])) as ProductMap;
}

function facts(
  approved: Partial<Record<AdvisorAssetBucketValue, AdvisorProductFact[]>> = {},
  fallback: Partial<Record<AdvisorAssetBucketValue, AdvisorProductFact[]>> = {},
) {
  return {
    approvedProducts: { ...emptyMap(), ...approved },
    fallbackRankings: { ...emptyMap(), ...fallback },
  };
}

const APPROVED: AdvisorProductFact = {
  approvedProductId: 'ap_1',
  fundId: 'fund_1',
  stockId: null,
  label: 'Adviser Pick Flexi Cap',
  score: null,
};

const APPROVED_SECOND: AdvisorProductFact = {
  approvedProductId: 'ap_2',
  fundId: 'fund_2',
  stockId: null,
  label: 'Adviser Second Choice',
  score: null,
};

const FALLBACK_TOP: AdvisorProductFact = {
  approvedProductId: null,
  fundId: 'fund_9',
  stockId: null,
  label: 'NAV-Ranked Flexi Cap',
  score: 11.42,
};

const FALLBACK_NEXT: AdvisorProductFact = {
  approvedProductId: null,
  fundId: 'fund_10',
  stockId: null,
  label: 'NAV-Ranked Runner Up',
  score: 8.1,
};

describe('resolveProduct', () => {
  it('prefers the adviser-approved list even when a fallback exists', () => {
    const result = resolveProduct(
      'EQUITY_DOMESTIC',
      facts({ EQUITY_DOMESTIC: [APPROVED] }, { EQUITY_DOMESTIC: [FALLBACK_TOP] }),
    );
    expect(result?.product).toBe(APPROVED);
    expect(result?.provenance).toEqual({ kind: 'APPROVED_LIST', approvedProductId: 'ap_1' });
  });

  it('takes the top of the rank-ordered approved list', () => {
    const result = resolveProduct(
      'EQUITY_DOMESTIC',
      facts({ EQUITY_DOMESTIC: [APPROVED, APPROVED_SECOND] }),
    );
    expect(result?.product.label).toBe('Adviser Pick Flexi Cap');
  });

  it('falls back to the top NAV-ranked candidate when nothing is approved', () => {
    const result = resolveProduct(
      'EQUITY_DOMESTIC',
      facts({}, { EQUITY_DOMESTIC: [FALLBACK_TOP, FALLBACK_NEXT] }),
    );
    expect(result?.product).toBe(FALLBACK_TOP);
    expect(result?.provenance).toEqual({
      kind: 'FALLBACK_RANKING',
      candidateLabel: 'NAV-Ranked Flexi Cap',
      score: 11.42,
    });
  });

  it('never returns a product without provenance', () => {
    const buckets: AdvisorAssetBucketValue[] = ['EQUITY_DOMESTIC', 'DEBT', 'GOLD'];
    const f = facts(
      { EQUITY_DOMESTIC: [APPROVED] },
      { DEBT: [FALLBACK_TOP], GOLD: [FALLBACK_NEXT] },
    );
    for (const bucket of buckets) {
      const result = resolveProduct(bucket, f);
      expect(result).not.toBeNull();
      expect(result!.provenance.kind).not.toBe('NONE');
      expect(['APPROVED_LIST', 'FALLBACK_RANKING']).toContain(result!.provenance.kind);
    }
  });

  it('returns null when neither list has anything for the bucket', () => {
    expect(resolveProduct('GOLD', facts({ EQUITY_DOMESTIC: [APPROVED] }))).toBeNull();
  });

  it('returns null for a completely unpopulated fact set', () => {
    expect(resolveProduct('DEBT', facts())).toBeNull();
  });

  it('omits approvedProductId rather than inventing one', () => {
    const unidentified: AdvisorProductFact = { ...APPROVED, approvedProductId: null };
    const result = resolveProduct('DEBT', facts({ DEBT: [unidentified] }));
    expect(result?.provenance).toEqual({ kind: 'APPROVED_LIST' });
  });

  it('omits the score when a fallback candidate has none', () => {
    const unscored: AdvisorProductFact = { ...FALLBACK_TOP, score: null };
    const result = resolveProduct('DEBT', facts({}, { DEBT: [unscored] }));
    expect(result?.provenance).toEqual({
      kind: 'FALLBACK_RANKING',
      candidateLabel: 'NAV-Ranked Flexi Cap',
    });
  });

  it('skips a blank entry rather than naming an unlabelled product', () => {
    const blank: AdvisorProductFact = { ...APPROVED, label: '   ' };
    const result = resolveProduct('DEBT', facts({ DEBT: [blank, APPROVED_SECOND] }));
    expect(result?.product).toBe(APPROVED_SECOND);
  });

  it('falls through to the ranking when the approved list is present but unusable', () => {
    const blank: AdvisorProductFact = { ...APPROVED, label: '' };
    const result = resolveProduct('DEBT', facts({ DEBT: [blank] }, { DEBT: [FALLBACK_TOP] }));
    expect(result?.provenance.kind).toBe('FALLBACK_RANKING');
  });
});
