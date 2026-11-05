import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { detectSeries, findOneOffs, matchManualItems, matchRefunds, monthlyTotals, type AnalysisRow } from './spendAnalysis.js';

let n = 0;
const row = (date: string, amount: number, category: string, payeeKey: string | null, direction = 'DEBIT', ignored = false): AnalysisRow => ({
  id: `r${++n}`, txnDate: new Date(`${date}T00:00:00Z`), amount: new Decimal(amount), direction, category, payeeKey, ignored,
});
const monthly = (payee: string, category: string, amounts: number[], startMonth = 1, day = 5, year = 2025) =>
  amounts.map((a, i) => {
    const m = startMonth + i;
    const y = year + Math.floor((m - 1) / 12);
    const mm = ((m - 1) % 12) + 1;
    return row(`${y}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`, a, category, payee);
  });

describe('detectSeries', () => {
  it('finds monthly rent, with the price rise, as a fixed series', () => {
    const rows = monthly('landlord', 'rent', [...Array(12).fill(24000), ...Array(12).fill(26000)]);
    const [s] = detectSeries(rows);
    expect(s).toMatchObject({ payeeKey: 'landlord', category: 'rent', cadence: 'MONTHLY', occurrences: 24, isFixed: true });
    expect(s!.latestAmount.toNumber()).toBe(26000);
  });

  it('finds an annual school fee from two years', () => {
    const rows = [row('2025-06-10', 150000, 'education', 'dps'), row('2026-06-08', 165000, 'education', 'dps')];
    expect(detectSeries(rows)).toEqual([expect.objectContaining({ cadence: 'ANNUAL', occurrences: 2, isFixed: true })]);
  });

  it('a monthly bill that varies is recurring but not fixed', () => {
    const rows = monthly('bescom', 'utilities', [1800, 2600, 3400, 2100, 1500, 2900]);
    expect(detectSeries(rows)[0]).toMatchObject({ cadence: 'MONTHLY', isFixed: false });
  });

  it('ignores frequent irregular payees, transfers and too-short histories', () => {
    const swiggy = Array.from({ length: 20 }, (_, i) => row(`2026-0${1 + (i % 6)}-${String(1 + i).padStart(2, '0')}`, 400, 'dining_out', 'swiggy'));
    const self = monthly('me', 'self_transfer', [5000, 5000, 5000, 5000]);
    const short = monthly('netflix', 'lifestyle', [649, 649]);
    const ignored = monthly('dup', 'rent', [1000, 1000, 1000]).map((r) => ({ ...r, ignored: true }));
    expect(detectSeries([...swiggy, ...self, ...short, ...ignored])).toEqual([]);
  });
});

describe('findOneOffs', () => {
  it('sets aside a purchase over 3× the typical month, not regular payments', () => {
    const rows = [
      ...monthly('dmart', 'household', [2000, 2500, 1800, 2200]),
      row('2025-05-20', 60000, 'household', 'ikea'),
    ];
    const ids = findOneOffs(rows, new Set());
    expect([...ids]).toEqual([rows[4]!.id]);
    expect(findOneOffs(rows, new Set([rows[4]!.id])).size).toBe(0); // part of a series → never a one-off
  });

  it('needs three months of history in the category first', () => {
    const rows = [row('2025-01-05', 500, 'clothing', 'x'), row('2025-02-05', 9000, 'clothing', 'y')];
    expect(findOneOffs(rows, new Set()).size).toBe(0);
  });
});

describe('matchRefunds and monthlyTotals', () => {
  it('nets a refund off the category it reverses, in the refund month', () => {
    const buy = row('2025-03-28', 3000, 'clothing', 'myntra');
    const groceries = row('2025-04-02', 5000, 'groceries', 'bigbasket');
    const refund = row('2025-04-06', 1200, 'refund', 'myntra', 'CREDIT');
    const rows = [buy, groceries, refund];
    const refunds = matchRefunds(rows);
    expect(refunds.get(refund.id)).toBe(buy.id);

    const totals = monthlyTotals(rows, new Set(), refunds);
    const amount = (m: string, c: string) => totals.find((t) => t.month === m && t.category === c)?.amount.toNumber();
    expect(amount('2025-03', 'clothing')).toBe(3000);
    expect(amount('2025-04', 'clothing')).toBe(0); // 1,200 netted, floored at zero
    expect(amount('2025-04', 'groceries')).toBe(5000);
  });

  it('does not match a refund larger than the payment, or too late', () => {
    expect(matchRefunds([row('2025-01-01', 500, 'clothing', 'a'), row('2025-01-05', 900, 'refund', 'a', 'CREDIT')]).size).toBe(0);
    expect(matchRefunds([row('2025-01-01', 900, 'clothing', 'a'), row('2025-04-05', 500, 'refund', 'a', 'CREDIT')]).size).toBe(0);
  });

  it('keeps one-offs and ignored rows out of the amount', () => {
    const big = row('2025-05-20', 60000, 'household', 'ikea');
    const dup = { ...row('2025-05-21', 999, 'household', 'x'), ignored: true };
    const t = monthlyTotals([big, dup], new Set([big.id]), new Map());
    expect(t).toEqual([expect.objectContaining({ month: '2025-05', category: 'household', count: 0 })]);
    expect(t[0]!.amount.toNumber()).toBe(0);
    expect(t[0]!.oneOffAmount.toNumber()).toBe(60000);
  });
});

describe('matchManualItems', () => {
  const series = [
    { key: 's-rent', category: 'rent', cadence: 'MONTHLY' as const, latestAmount: new Decimal(25000) },
    { key: 's-fee', category: 'education', cadence: 'ANNUAL' as const, latestAmount: new Decimal(300000) },
  ];
  it('matches a typed rent to the bank rent within 10% a year', () => {
    const m = matchManualItems(
      [
        { id: 'rent', divisionCode: '04', amount: new Decimal(24000), frequency: 'MONTHLY' },
        { id: 'fee', divisionCode: '10', amount: new Decimal(310000), frequency: 'YEARLY' },
        { id: 'cash-maid', divisionCode: '05', amount: new Decimal(8000), frequency: 'MONTHLY' },
      ],
      series,
    );
    expect(Object.fromEntries(m)).toEqual({ rent: 's-rent', fee: 's-fee' });
  });

  it('does not match a different category or a different amount', () => {
    expect(matchManualItems([{ id: 'x', divisionCode: '01', amount: new Decimal(25000), frequency: 'MONTHLY' }], series).size).toBe(0);
    expect(matchManualItems([{ id: 'x', divisionCode: '04', amount: new Decimal(15000), frequency: 'MONTHLY' }], series).size).toBe(0);
  });

  it('each bank series covers one item: the closest', () => {
    const m = matchManualItems(
      [
        { id: 'a', divisionCode: '04', amount: new Decimal(23500), frequency: 'MONTHLY' },
        { id: 'b', divisionCode: '04', amount: new Decimal(25000), frequency: 'MONTHLY' },
      ],
      series,
    );
    expect(Object.fromEntries(m)).toEqual({ b: 's-rent' });
  });
});

describe('series and one-offs together', () => {
  it('a stock-up at the usual grocer stays out of the series and is a one-off', () => {
    const regular = monthly('bigbasket', 'groceries', [3000, 3000, 3000, 3000, 3000, 3000]);
    const stockUp = row('2025-04-20', 60000, 'groceries', 'bigbasket');
    const rows = [...regular, stockUp];
    const [s] = detectSeries(rows);
    expect(s!.memberIds).not.toContain(stockUp.id);
    expect(s!.occurrences).toBe(6);
    expect([...findOneOffs(rows, new Set(s!.memberIds))]).toEqual([stockUp.id]);
  });
});
