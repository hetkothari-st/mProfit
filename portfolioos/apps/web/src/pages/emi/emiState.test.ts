import { describe, it, expect } from 'vitest';
import { Decimal } from '@everypaisa/shared';
import { compactInr, computeCalc, computeCompare, defaultCalcState, defaultCompareState, groupedWhole, moneyWhole } from './emiState';

const fixedToday = new Date(2026, 9, 12); // 12 Oct 2026, local

describe('defaultCalcState', () => {
  it('first EMI defaults to the 5th of next month (local calendar)', () => {
    expect(defaultCalcState(fixedToday).firstEmiDate).toBe('2026-11-05');
  });
});

describe('computeCalc', () => {
  const s = { ...defaultCalcState(fixedToday), principal: '10,00,000', ratePct: '8.5', tenure: '20', tenureUnit: 'Y' as const };

  it('EMI mode', () => {
    const o = computeCalc(s);
    if (!o.ok) throw new Error(JSON.stringify(o.errors));
    expect(o.summary.emi.toFixed(0)).toBe('8679');
    expect(o.tenureMonths).toBe(240);
  });

  it('MAX_LOAN mode derives the principal from the EMI', () => {
    const o = computeCalc({ ...s, mode: 'MAX_LOAN', emi: '8679' });
    if (!o.ok) throw new Error(JSON.stringify(o.errors));
    expect(o.principal.toFixed(0)).toBe('1000088');
  });

  it('TENURE mode derives months from the EMI', () => {
    const o = computeCalc({ ...s, mode: 'TENURE', emi: '10000' });
    if (!o.ok) throw new Error(JSON.stringify(o.errors));
    expect(o.tenureMonths).toBe(175);
  });

  it('TENURE mode with a too-small EMI reports an emi field error', () => {
    const o = computeCalc({ ...s, mode: 'TENURE', emi: '5000' });
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.errors[0]!.field).toBe('emi');
  });

  it('reports field errors instead of throwing', () => {
    const o = computeCalc({ ...s, principal: '', ratePct: '60' });
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['principal', 'annualRatePct']));
  });

  it('includes prepayments, fees and tax only when switched on', () => {
    const o = computeCalc({
      ...s,
      prepayments: [{ id: 'a', month: '12', amount: '1,00,000', recurrence: 'ONCE', mode: 'REDUCE_TENURE' }],
      feesOn: true, feeKind: 'PCT', feeValue: '0.5', gstPct: '18', otherCharges: '0',
      taxOn: false,
    });
    if (!o.ok) throw new Error(JSON.stringify(o.errors));
    expect(o.summary.months).toBeLessThan(240);
    expect(o.summary.fees.total.toFixed(2)).toBe('5900.00');
    expect(o.summary.tax).toBeUndefined();
  });

  it('a non-numeric prepayment month is a field error, not NaN', () => {
    const o = computeCalc({ ...s, prepayments: [{ id: 'a', month: 'x', amount: '100', recurrence: 'ONCE', mode: 'REDUCE_TENURE' }] });
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.errors[0]!.field).toBe('prepayments.0.month');
  });
});

describe('computeCompare', () => {
  it('compares offers and prefixes errors with the offer index', () => {
    const c = defaultCompareState();
    const good = computeCompare(c, '2026-11-05');
    expect(good.ok).toBe(true);
    const bad = computeCompare({ offers: [{ ...c.offers[0]!, ratePct: 'x' }, c.offers[1]!] }, '2026-11-05');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]!.field).toBe('offers.0.annualRatePct');
  });
  it('applies the tax input to every offer so post-tax cost is ranked', () => {
    const o = computeCompare(defaultCompareState(), '2026-11-05', { regime: 'OLD', loanKind: 'HOME_SELF', slabPct: '30', remaining80C: '150000' });
    if (!o.ok) throw new Error('expected ok');
    expect(o.result.cheapestPostTax).not.toBeNull();
    expect(o.result.offers.every((x) => x.postTaxCost !== undefined)).toBe(true);
  });
});

describe('display helpers', () => {
  it('compactInr: K below a lakh, L for lakhs, Cr for crores', () => {
    expect(compactInr(45000)).toBe('₹45K');
    expect(compactInr(1250000)).toBe('₹12.5L');
    expect(compactInr(12000000)).toBe('₹1.2Cr');
    expect(compactInr(0)).toBe('₹0');
  });
  it('moneyWhole drops paise; groupedWhole groups slider values the Indian way', () => {
    expect(moneyWhole(new Decimal('1234567.89'))).toBe('₹12,34,568');
    expect(groupedWhole('2500000')).toBe('25,00,000');
  });
});

describe('computeCalc - derived-field errors', () => {
  const s = { ...defaultCalcState(fixedToday), principal: '10,00,000', ratePct: '8.5', tenure: '20', tenureUnit: 'Y' as const };
  it('MAX_LOAN: a loan above the limit is reported on the EMI field', () => {
    const o = computeCalc({ ...s, mode: 'MAX_LOAN', emi: '50,00,00,000' });
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.errors).toEqual([{ field: 'emi', message: 'This EMI gives a loan above the Rs. 100 crore limit' }]);
  });
  it('TENURE: an EMI that takes over 40 years is an emi error, with no duplicate tenure error', () => {
    const o = computeCalc({ ...s, mode: 'TENURE', emi: '7,200' });
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.errors).toEqual([{ field: 'emi', message: 'This EMI takes longer than 40 years to repay' }]);
  });
  it('accepts a rate typed as .5 style', () => {
    expect(computeCalc({ ...s, ratePct: '8.' }).ok).toBe(true);
  });
});
