import { describe, it, expect } from 'vitest';
import type { PersonalInflationSummary } from '@everypaisa/shared';
import { driverRows, formatRatePct, formatCpiMonth, suggestGoalRate } from './personalInflationView';

const base: PersonalInflationSummary = {
  profile: { stateCode: 1, sector: 'COMBINED' },
  asOf: '2026-09',
  official: [
    { divisionCode: '00', latestYoy: '0.055400', longRunRate: '0.052000', yearsUsed: 5, source: 'ALL_INDIA' },
    { divisionCode: '10', latestYoy: '0.039400', longRunRate: '0.041234', yearsUsed: 5, source: 'ALL_INDIA' },
  ],
  items: [],
  personalRate: null,
  horizons: [1, 3, 5, 10],
  totals: { annualAmount: '0.0000', projections: [] },
  byDivision: [],
  fixedPayments: null,
};

describe('personalInflationView', () => {
  it('formats rates and months', () => {
    expect(formatRatePct('0.150000')).toBe('15.0%');
    expect(formatRatePct(null)).toBe('—');
    expect(formatCpiMonth('2026-09')).toMatch(/Sep.*2026/);
  });

  it('education goal: own education rate first, then official', () => {
    expect(suggestGoalRate(base, 'CHILD_EDUCATION')).toEqual({ rate: '0.0412', label: 'official education inflation' });
    const withFee = { ...base, byDivision: [{ divisionCode: '10', annualAmount: '300000.0000', share: '1.000000', rate: '0.150000' }] };
    expect(suggestGoalRate(withFee, 'CHILD_EDUCATION')).toEqual({ rate: '0.1500', label: 'your education inflation' });
  });

  it('other goals: personal rate first, then official headline', () => {
    expect(suggestGoalRate(base, 'RETIREMENT')).toEqual({ rate: '0.0520', label: 'official CPI inflation' });
    expect(suggestGoalRate({ ...base, personalRate: '0.081234' }, 'RETIREMENT')).toEqual({ rate: '0.0812', label: 'your personal inflation' });
  });

  it('nothing to suggest before CPI is loaded', () => {
    expect(suggestGoalRate(undefined, 'RETIREMENT')).toBeNull();
    expect(suggestGoalRate({ ...base, official: [] }, 'RETIREMENT')).toBeNull();
  });
});

describe('driverRows', () => {
  const div = (code: string, share: string, rate: string | null) => ({ divisionCode: code, annualAmount: '0', share, rate });
  it('orders by push and folds categories under 2% into one row', () => {
    const rows = driverRows([
      div('01', '0.600000', '0.050000'),
      div('10', '0.380000', '0.110000'),
      div('03', '0.010000', '0.030000'),
      div('08', '0.010000', '0.010000'),
    ]);
    expect(rows.map((r) => r.code)).toEqual(['10', '01', null]);
    expect(rows[2]!.share.toFixed(2)).toBe('0.02');
    expect(rows[2]!.rate.toFixed(3)).toBe('0.020');
    expect(rows[2]!.count).toBe(2);
  });
  it('keeps a single small category as itself and skips unrated ones', () => {
    const rows = driverRows([div('01', '0.990000', '0.050000'), div('03', '0.010000', '0.030000'), div('08', '0', null)]);
    expect(rows.map((r) => r.code)).toEqual(['01', '03']);
  });
});

describe('suggestGoalRate: healthcare', () => {
  it('uses your health rate, then the official one', () => {
    const official = [...base.official, { divisionCode: '06', latestYoy: '0.041000', longRunRate: '0.068000', yearsUsed: 5, source: 'ALL_INDIA' as const }];
    expect(suggestGoalRate({ ...base, official }, 'HEALTHCARE')).toEqual({ rate: '0.0680', label: 'official health inflation' });
    const byDivision = [{ divisionCode: '06', annualAmount: '28400.0000', share: '1.000000', rate: '0.120000' }];
    expect(suggestGoalRate({ ...base, official, byDivision }, 'HEALTHCARE')).toEqual({ rate: '0.1200', label: 'your health inflation' });
  });
});
