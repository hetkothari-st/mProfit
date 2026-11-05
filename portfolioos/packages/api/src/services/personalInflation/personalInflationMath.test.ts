import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  longRunRate,
  historyCagr,
  resolveItemRate,
  weightedRate,
  projectAmount,
  annualise,
  isOutsideBasket,
  monthlySipFor,
} from './personalInflationMath.js';

const D = (v: string | number) => new Decimal(v);
const r6 = (d: Decimal | null | undefined) => d?.toFixed(6) ?? null;

describe('longRunRate', () => {
  it('compounds same-month YoY readings into an annualised rate', () => {
    // (1.10 × 1.00)^(1/2) − 1 = 0.048809
    expect(r6(longRunRate([D('10'), D('0')]))).toBe('0.048809');
  });
  it('equals the reading when there is one', () => {
    expect(r6(longRunRate([D('5.54')]))).toBe('0.055400');
  });
  it('handles deflation years', () => {
    expect(r6(longRunRate([D('-2'), D('2')]))).toBe('-0.000200');
  });
  it('is null with no readings', () => {
    expect(longRunRate([])).toBeNull();
  });
});

describe('historyCagr', () => {
  it('derives an annual rate from two fee points two years apart', () => {
    // 1,00,000 → 1,32,250 over 2 years = 15% a year.
    const out = historyCagr([
      { asOf: new Date('2024-06-01'), amount: D('100000') },
      { asOf: new Date('2026-06-01'), amount: D('132250') },
    ]);
    expect(out).not.toBeNull();
    expect(out!.rate.toFixed(3)).toBe('0.150');
    expect(out!.years.toFixed(1)).toBe('2.0');
  });
  it('uses the earliest and latest points regardless of input order', () => {
    const out = historyCagr([
      { asOf: new Date('2026-06-01'), amount: D('121') },
      { asOf: new Date('2025-06-01'), amount: D('999') },
      { asOf: new Date('2024-06-01'), amount: D('100') },
    ]);
    expect(out!.rate.toFixed(3)).toBe('0.100');
  });
  it('refuses a span under ~11 months — too short to annualise honestly', () => {
    expect(historyCagr([
      { asOf: new Date('2026-01-01'), amount: D('100') },
      { asOf: new Date('2026-06-01'), amount: D('110') },
    ])).toBeNull();
  });
  it('refuses fewer than two points or a non-positive amount', () => {
    expect(historyCagr([{ asOf: new Date('2024-01-01'), amount: D('100') }])).toBeNull();
    expect(historyCagr([
      { asOf: new Date('2024-01-01'), amount: D('0') },
      { asOf: new Date('2026-01-01'), amount: D('100') },
    ])).toBeNull();
  });
});

describe('resolveItemRate', () => {
  const official = new Map([['10', D('0.04')], ['00', D('0.05')]]);
  const history = [
    { asOf: new Date('2024-06-01'), amount: D('100000') },
    { asOf: new Date('2026-06-01'), amount: D('132250') },
  ];

  it('OFFICIAL uses the division long-run rate', () => {
    const r = resolveItemRate({ divisionCode: '10', rateMode: 'OFFICIAL', customRate: null, pricePoints: [] }, official);
    expect(r).toMatchObject({ source: 'OFFICIAL', note: null });
    expect(r.rate!.toString()).toBe('0.04');
  });
  it('falls back to the headline rate when the division has none', () => {
    const r = resolveItemRate({ divisionCode: '06', rateMode: 'OFFICIAL', customRate: null, pricePoints: [] }, official);
    expect(r.rate!.toString()).toBe('0.05');
    expect(r.note).toBe('division_unavailable');
  });
  it('CUSTOM uses the typed rate', () => {
    const r = resolveItemRate({ divisionCode: '10', rateMode: 'CUSTOM', customRate: D('0.15'), pricePoints: [] }, official);
    expect(r).toMatchObject({ source: 'CUSTOM' });
    expect(r.rate!.toString()).toBe('0.15');
  });
  it('HISTORY uses the item’s own CAGR', () => {
    const r = resolveItemRate({ divisionCode: '10', rateMode: 'HISTORY', customRate: null, pricePoints: history }, official);
    expect(r.source).toBe('HISTORY');
    expect(r.rate!.toFixed(3)).toBe('0.150');
  });
  it('HISTORY without enough points falls back to official, and says so', () => {
    const r = resolveItemRate({ divisionCode: '10', rateMode: 'HISTORY', customRate: null, pricePoints: history.slice(0, 1) }, official);
    expect(r).toMatchObject({ source: 'OFFICIAL', note: 'insufficient_history' });
    expect(r.rate!.toString()).toBe('0.04');
  });
  it('is null when nothing official is loaded yet', () => {
    const r = resolveItemRate({ divisionCode: '10', rateMode: 'OFFICIAL', customRate: null, pricePoints: [] }, new Map());
    expect(r.rate).toBeNull();
  });
});

describe('weightedRate / projectAmount / annualise', () => {
  it('weights rates by annual spend, skipping unrated items', () => {
    // 3,00,000 at 15% + 1,00,000 at 5% → 12.5%
    const out = weightedRate([
      { annualAmount: D('300000'), rate: D('0.15') },
      { annualAmount: D('100000'), rate: D('0.05') },
      { annualAmount: D('999999'), rate: null },
    ]);
    expect(out!.toString()).toBe('0.125');
  });
  it('is null for an empty basket', () => {
    expect(weightedRate([])).toBeNull();
  });
  it('projects with annual compounding', () => {
    expect(projectAmount(D('100000'), D('0.15'), 1).toFixed(2)).toBe('115000.00');
    expect(projectAmount(D('100000'), D('0.15'), 3).toFixed(2)).toBe('152087.50');
  });
  it('annualises monthly amounts', () => {
    expect(annualise(D('12000'), 'MONTHLY').toString()).toBe('144000');
    expect(annualise(D('12000'), 'YEARLY').toString()).toBe('12000');
  });
});

// The worked example in the product spec (PERSONAL_INFLATION_SPEC.md §7).
describe('spec worked example', () => {
  it('weights category rates by spend: 8.801%', () => {
    const basket = [
      { annualAmount: D(9), rate: D('0.126') },
      { annualAmount: D(22), rate: D('0.112') },
      { annualAmount: D(31), rate: D('0.081') },
      { annualAmount: D(18), rate: D('0.074') },
      { annualAmount: D(20), rate: D('0.068') },
    ];
    expect(weightedRate(basket)!.toFixed(5)).toBe('0.08801');
  });

  it('education goal: gap ₹35,16,717 and extra SIP ₹11,414 a month at 12%', () => {
    const fvMine = projectAmount(D(2000000), D('0.112'), 12);
    const fvCpi = projectAmount(D(2000000), D('0.051'), 12);
    expect(fvMine.toFixed(0)).toBe('7149694');
    expect(fvCpi.toFixed(0)).toBe('3632976');
    const gap = fvMine.minus(fvCpi);
    expect(gap.toFixed(0)).toBe('3516717');
    expect(monthlySipFor(gap, 12, D('0.12'))!.toFixed(0)).toBe('11414');
  });

  it('no return means the gap split evenly over the months', () => {
    expect(monthlySipFor(D(1200), 1, D(0))!.toFixed(0)).toBe('100');
    expect(monthlySipFor(D(0), 5, D('0.12'))).toBeNull();
  });
});

describe('isOutsideBasket', () => {
  it('leaves out EMIs and fixed life premiums, keeps everything else', () => {
    expect(isOutsideBasket({ sourceRef: 'loan:x', rateMode: 'CUSTOM', customRate: D(0) })).toBe(true);
    expect(isOutsideBasket({ sourceRef: 'insurance:x', rateMode: 'CUSTOM', customRate: D(0) })).toBe(true);
    expect(isOutsideBasket({ sourceRef: 'insurance:x', rateMode: 'OFFICIAL', customRate: null })).toBe(false);
    expect(isOutsideBasket({ sourceRef: null, rateMode: 'CUSTOM', customRate: D(0) })).toBe(false);
    expect(isOutsideBasket({ sourceRef: 'property:x', rateMode: 'OFFICIAL', customRate: null })).toBe(false);
  });
});
