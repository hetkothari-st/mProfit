import { describe, it, expect } from 'vitest';
import {
  targetsForCategory,
  validateTargetWeights,
} from '../../../src/services/advisor/modelPortfolioMath.js';
import { DEFAULT_TARGET_WEIGHTS } from '../../../src/services/advisor/constants.js';
import { ADVISOR_ASSET_BUCKETS } from '../../../src/services/advisor/types.js';
import { RISK_CATEGORIES } from '../../../src/services/riskProfileMath.js';
import type { AdvisorTargetFact } from '../../../src/services/advisor/types.js';

describe('DEFAULT_TARGET_WEIGHTS', () => {
  // The comment in constants.ts promises each column sums to 100. This is the
  // assertion that promise is worth something: a mis-typed default would
  // otherwise skew every drift row for every user on that risk category.
  it.each(RISK_CATEGORIES)('the %s column sums to exactly 100', (category) => {
    const column = DEFAULT_TARGET_WEIGHTS[category];
    const sum = ADVISOR_ASSET_BUCKETS.reduce((acc, bucket) => acc + column[bucket], 0);
    expect(sum).toBe(100);
  });

  it.each(RISK_CATEGORIES)('the %s column covers every bucket with a non-negative weight', (category) => {
    const column = DEFAULT_TARGET_WEIGHTS[category];
    for (const bucket of ADVISOR_ASSET_BUCKETS) {
      expect(typeof column[bucket]).toBe('number');
      expect(column[bucket]).toBeGreaterThanOrEqual(0);
    }
  });

  it('never tells anyone to buy property or crypto to hit a weight', () => {
    for (const category of RISK_CATEGORIES) {
      expect(DEFAULT_TARGET_WEIGHTS[category].REAL_ASSETS).toBe(0);
      expect(DEFAULT_TARGET_WEIGHTS[category].OTHER_ALT).toBe(0);
    }
  });
});

describe('targetsForCategory', () => {
  it('returns every bucket in canonical order, including the zero-weight ones', () => {
    const targets = targetsForCategory('BALANCED');
    expect(targets.map((t) => t.bucket)).toEqual([...ADVISOR_ASSET_BUCKETS]);
  });

  it('mirrors DEFAULT_TARGET_WEIGHTS', () => {
    for (const category of RISK_CATEGORIES) {
      for (const target of targetsForCategory(category)) {
        expect(target.targetPct).toBe(DEFAULT_TARGET_WEIGHTS[category][target.bucket]);
      }
    }
  });

  it('produces weights that pass validation for every risk category', () => {
    for (const category of RISK_CATEGORIES) {
      expect(validateTargetWeights(targetsForCategory(category))).toEqual({ ok: true });
    }
  });

  it('gets riskier as the category does', () => {
    const equityOf = (c: (typeof RISK_CATEGORIES)[number]) =>
      targetsForCategory(c).find((t) => t.bucket === 'EQUITY_DOMESTIC')!.targetPct;
    expect(equityOf('CONSERVATIVE')).toBeLessThan(equityOf('BALANCED'));
    expect(equityOf('BALANCED')).toBeLessThan(equityOf('GROWTH'));
    expect(equityOf('GROWTH')).toBeLessThan(equityOf('AGGRESSIVE'));
  });
});

describe('validateTargetWeights', () => {
  const ok = (weights: AdvisorTargetFact[]) => validateTargetWeights(weights);

  it('accepts a set summing to 100', () => {
    expect(
      ok([
        { bucket: 'EQUITY_DOMESTIC', targetPct: 60 },
        { bucket: 'DEBT', targetPct: 40 },
      ]),
    ).toEqual({ ok: true });
  });

  it('tolerates float noise within 0.01', () => {
    const result = ok([
      { bucket: 'EQUITY_DOMESTIC', targetPct: 33.33 },
      { bucket: 'DEBT', targetPct: 33.33 },
      { bucket: 'GOLD', targetPct: 33.34 },
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects a set that does not sum to 100', () => {
    const result = ok([
      { bucket: 'EQUITY_DOMESTIC', targetPct: 60 },
      { bucket: 'DEBT', targetPct: 30 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/sum/i);
  });

  it('rejects a sum that is off by more than the tolerance', () => {
    const result = ok([
      { bucket: 'EQUITY_DOMESTIC', targetPct: 60 },
      { bucket: 'DEBT', targetPct: 39.97 },
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects negative weights', () => {
    const result = ok([
      { bucket: 'EQUITY_DOMESTIC', targetPct: 120 },
      { bucket: 'DEBT', targetPct: -20 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/negative/i);
  });

  it('rejects duplicate buckets', () => {
    const result = ok([
      { bucket: 'EQUITY_DOMESTIC', targetPct: 50 },
      { bucket: 'EQUITY_DOMESTIC', targetPct: 50 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/duplicate/i);
  });

  it('rejects an unknown bucket', () => {
    const result = ok([
      { bucket: 'CRYPTO_MOONSHOT' as AdvisorTargetFact['bucket'], targetPct: 100 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/unknown/i);
  });

  it('rejects a non-finite weight', () => {
    const result = ok([
      { bucket: 'EQUITY_DOMESTIC', targetPct: Number.NaN },
      { bucket: 'DEBT', targetPct: 100 },
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects an empty set', () => {
    expect(ok([]).ok).toBe(false);
  });
});
