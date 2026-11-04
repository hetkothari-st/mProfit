import { describe, it, expect } from 'vitest';
import type { PersonalInflationSummary } from '@everypaisa/shared';
import { formatRatePct, formatCpiMonth, suggestGoalRate } from './personalInflationView';

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
