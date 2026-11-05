import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  bankBasis,
  categoryDivisionMap,
  engineParams,
  seriesOwnRate,
  windowMonths,
  DEFAULT_ENGINE_PARAMS,
  type MonthlyCategoryRow,
  type SeriesPayments,
} from './pirEngine.js';

const d = (v: number | string) => new Decimal(v);
const MONTHS = windowMonths(new Date('2026-11-05T00:00:00Z'), 12);

/** The same amount for a category in each of the first `n` window months. */
const spread = (category: string, yearly: number, n = 12): MonthlyCategoryRow[] =>
  MONTHS.slice(0, n).map((month) => ({ month, category, amount: d(yearly).dividedBy(n) }));

const cpi = new Map<string, Decimal>([
  ['00', d('0.051')],
  ['01', d('0.068')], // groceries
  ['04', d('0.06')], // housing
  ['06', d('0.126')], // health
  ['09', d('0.074')], // recreation
  ['10', d('0.112')], // education
]);

const series = (over: Partial<SeriesPayments>): SeriesPayments => ({
  id: 's1', payeeKey: 'landlord', category: 'rent', cadence: 'MONTHLY', isFixed: true, acceptOwnRate: null,
  current: [], previous: [], ...over,
});

const full = { incomeMonths: 12, cardPurchases: 0, cpi };

describe('windowMonths', () => {
  it('is the last 12 complete months, and the 12 before', () => {
    expect(MONTHS[0]).toBe('2025-11');
    expect(MONTHS[11]).toBe('2026-10');
    expect(windowMonths(new Date('2026-01-10T00:00:00Z'), 12, 12)).toEqual(
      expect.arrayContaining(['2024-01', '2024-12']),
    );
  });
});

describe('spec §7 worked example', () => {
  it('PIR = 8.801% from the five categories at their CPI rates', () => {
    const b = bankBasis({
      ...full,
      months: [
        ...spread('healthcare', 9000),
        ...spread('education', 22000),
        ...spread('rent', 31000),
        ...spread('lifestyle', 18000),
        ...spread('groceries', 20000),
      ],
      series: [],
      // Rent uses its own 8.1% here, as in the table.
      cpi: new Map([...cpi, ['04', d('0.081')]]),
    });
    expect(b.rate!.toNumber()).toBeCloseTo(0.08801, 6);
    expect(b.ready).toBe(true);
    expect(b.confidence.toNumber()).toBe(1);
  });
});

describe('own price', () => {
  const rent = series({ current: Array(12).fill(d(26000)), previous: Array(12).fill(d(24000)) });

  it('rent 24,000 → 26,000 a month is 8.33%, method own_price', () => {
    expect(seriesOwnRate(rent)!.toNumber()).toBeCloseTo(0.083333, 6);
    const b = bankBasis({ ...full, months: spread('rent', 312000), series: [rent] });
    expect(b.categories[0]).toMatchObject({ category: 'rent', method: 'own_price' });
    expect(b.categories[0]!.rate!.toNumber()).toBeCloseTo(0.083333, 6);
  });

  it('blends with CPI by the share the series covers', () => {
    // 400,000 of rent spend, 312,000 of it the landlord series (α = 0.78); the rest at housing CPI 6%.
    const c = bankBasis({ ...full, months: spread('rent', 400000), series: [rent] }).categories[0]!;
    expect(c.method).toBe('blend');
    expect(c.alpha.toNumber()).toBeCloseTo(0.78, 6);
    expect(c.rate!.toNumber()).toBeCloseTo(0.78 * (2000 / 24000) + 0.22 * 0.06, 6);
  });

  it('needs the payee in both windows, and a fixed price', () => {
    expect(seriesOwnRate(series({ current: Array(12).fill(d(26000)), previous: [d(24000), d(24000)] }))).toBeNull();
    expect(seriesOwnRate({ ...rent, isFixed: false })).toBeNull();
    expect(seriesOwnRate(series({ cadence: 'ANNUAL', current: [d(165000)], previous: [d(150000)] }))!.toNumber()).toBeCloseTo(0.1, 6);
  });
});

describe('step change', () => {
  const fees = series({ id: 'fee', payeeKey: 'dps', category: 'education', cadence: 'ANNUAL', current: [d(210000)], previous: [d(150000)] });

  it('a 40% jump in school fees asks the user and falls back to CPI', () => {
    const b = bankBasis({ ...full, months: spread('education', 210000), series: [fees] });
    expect(b.stepChanges).toEqual([expect.objectContaining({ seriesId: 'fee', category: 'education' })]);
    expect(b.stepChanges[0]!.rate.toNumber()).toBeCloseTo(0.4, 6);
    expect(b.categories[0]).toMatchObject({ method: 'cpi' });
    expect(b.categories[0]!.rate!.toNumber()).toBe(0.112);
  });

  it('once the user says it was a real rise, the own rate is used', () => {
    const b = bankBasis({ ...full, months: spread('education', 210000), series: [{ ...fees, acceptOwnRate: true }] });
    expect(b.stepChanges).toEqual([]);
    expect(b.categories[0]!.rate!.toNumber()).toBeCloseTo(0.4, 6);
  });

  it('once the user says they moved, CPI stays and the question goes', () => {
    const b = bankBasis({ ...full, months: spread('education', 210000), series: [{ ...fees, acceptOwnRate: false }] });
    expect(b.stepChanges).toEqual([]);
    expect(b.categories[0]).toMatchObject({ method: 'cpi' });
  });

  it('a fall of more than 10% is a step change too', () => {
    const b = bankBasis({ ...full, months: spread('rent', 240000), series: [series({ current: Array(12).fill(d(20000)), previous: Array(12).fill(d(24000)) })] });
    expect(b.stepChanges).toHaveLength(1);
  });
});

describe('confidence', () => {
  it('5 months of data is not enough: building, below 0.6', () => {
    const b = bankBasis({ ...full, months: spread('groceries', 50000, 5), series: [] });
    expect(b.monthsOfHistory).toBe(5);
    expect(b.confidence.toNumber()).toBeCloseTo(5 / 12, 6);
    expect(b.ready).toBe(false);
    // The weights still annualise what was seen.
    expect(b.categories[0]!.annualAmount.toNumber()).toBeCloseTo(120000, 6);
  });

  it('scales by the categorised share and by account coverage', () => {
    const b = bankBasis({
      ...full,
      incomeMonths: 0,
      months: [...spread('groceries', 80000), ...spread('uncategorised', 20000)],
      series: [],
    });
    expect(b.categorisedShare.toNumber()).toBeCloseTo(0.8, 6);
    expect(b.accountCoverage.toNumber()).toBe(0.6);
    expect(b.confidence.toNumber()).toBeCloseTo(0.48, 6);
    expect(b.ready).toBe(false);
  });

  it('card bills without card line items count as other spending, less 0.1 confidence', () => {
    const months = [...spread('groceries', 60000), ...spread('credit_card_bill', 40000)];
    const b = bankBasis({ ...full, months, series: [] });
    expect(b.cardBillsCounted).toBe(true);
    expect(b.categories.map((c) => c.category)).toEqual(['groceries', 'other_consumption']);
    expect(b.confidence.toNumber()).toBeCloseTo(0.9, 6);

    const withCards = bankBasis({ ...full, cardPurchases: 30, months, series: [] });
    expect(withCards.cardBillsCounted).toBe(false);
    expect(withCards.categories.map((c) => c.category)).toEqual(['groceries']);
    expect(withCards.confidence.toNumber()).toBe(1);
  });

  it('flags heavy cash use', () => {
    const b = bankBasis({ ...full, months: [...spread('groceries', 80000), ...spread('cash_withdrawal', 20000)], series: [] });
    expect(b.cashHeavy).toBe(true);
    // Cash is categorised (as cash), so it does not lower confidence; it is just not in the basket.
    expect(b.categories.map((c) => c.category)).toEqual(['groceries']);
  });

  it('excluded categories never carry weight', () => {
    const b = bankBasis({
      ...full,
      months: [...spread('groceries', 50000), ...spread('investment', 500000), ...spread('loan_emi', 300000)],
      series: [],
    });
    expect(b.rate!.toNumber()).toBe(0.068);
  });
});

describe('overrides', () => {
  it('admin map override replaces known categories only', () => {
    const m = categoryDivisionMap({ dining_out: '01', nonsense: '01', rent: '99' });
    expect(m.dining_out).toBe('01');
    expect(m.rent).toBe('04');
    expect(categoryDivisionMap(null).dining_out).toBe('11');
  });

  it('engine params take numbers only', () => {
    expect(engineParams({ minConfidence: 0.5, windowMonths: 'x' })).toEqual({ ...DEFAULT_ENGINE_PARAMS, minConfidence: 0.5 });
  });
});
