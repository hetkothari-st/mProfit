import { describe, it, expect } from 'vitest';
import type { NetWorthResponse } from '@/api/dashboard.api';
import { computeSidebarValues, sortSectionsByValue } from './sidebarClassValues';

function netWorth(partial: {
  slices?: Array<{
    key: string;
    value: string;
    category?: 'FINANCIAL' | 'VEHICLE' | 'REAL_ESTATE';
  }>;
  loans?: string;
  cards?: string;
  premium?: string;
}): NetWorthResponse {
  return {
    allocationBreakdown: (partial.slices ?? []).map((s) => ({
      key: s.key,
      label: s.key,
      value: s.value,
      numericValue: 0,
      percent: 0,
      category: s.category ?? 'FINANCIAL',
    })),
    liabilities: {
      totalOutstanding: partial.loans ?? '0',
      totalCreditCardOutstanding: partial.cards ?? '0',
    },
    insurance: { annualPremiumTotal: partial.premium ?? '0' },
  } as unknown as NetWorthResponse;
}

const pref = (key: string, order: number) => ({ key, order, visible: true });

describe('computeSidebarValues', () => {
  it('maps every source to its sidebar section', () => {
    const v = computeSidebarValues({
      netWorth: netWorth({
        slices: [
          { key: 'EQUITY', value: '500000' },
          { key: 'ETF', value: '20000' },
          { key: 'MUTUAL_FUND', value: '300000' },
          { key: 'NPS', value: '90000' },
          { key: 'VEHICLE', value: '700000', category: 'VEHICLE' },
          { key: 'REAL_ESTATE', value: '4000000', category: 'REAL_ESTATE' },
        ],
        loans: '2500000',
        cards: '35000.50',
        premium: '42000',
      }),
      bankBalances: ['120000', null, '30000'],
      ownedRealEstateValue: '9000000',
    });
    expect(v.get('/stocks')!.toString()).toBe('500000');
    expect(v.get('/mutual-funds')!.toString()).toBe('320000');
    expect(v.get('/nps')!.toString()).toBe('90000');
    expect(v.get('/vehicles')!.toString()).toBe('700000');
    expect(v.get('/rental')!.toString()).toBe('4000000');
    expect(v.get('/real-estate')!.toString()).toBe('9000000');
    expect(v.get('/bank-accounts')!.toString()).toBe('150000');
    expect(v.get('/loans')!.toString()).toBe('2500000');
    expect(v.get('/credit-cards')!.toString()).toBe('35000.5');
    expect(v.get('/insurance')!.toString()).toBe('42000');
  });

  it('counts a negative figure (e.g. F&O loss) by size', () => {
    const v = computeSidebarValues({
      netWorth: netWorth({ slices: [{ key: 'FUTURES', value: '-15000' }] }),
    });
    expect(v.get('/fo')!.toString()).toBe('15000');
  });

  it('survives missing sources while they load', () => {
    const v = computeSidebarValues({});
    expect(v.get('/real-estate')!.isZero()).toBe(true);
  });
});

describe('sortSectionsByValue', () => {
  it('puts the largest first and empty classes last in their saved order', () => {
    const values = computeSidebarValues({
      netWorth: netWorth({ slices: [{ key: 'MUTUAL_FUND', value: '300000' }], loans: '2500000' }),
      bankBalances: ['50000'],
    });
    const sorted = sortSectionsByValue(
      [
        pref('/bank-accounts', 0),
        pref('/stocks', 1),
        pref('/mutual-funds', 2),
        pref('/gold', 3),
        pref('/loans', 4),
      ],
      values,
    ).map((s) => s.key);
    expect(sorted).toEqual(['/loans', '/mutual-funds', '/bank-accounts', '/stocks', '/gold']);
  });
});
