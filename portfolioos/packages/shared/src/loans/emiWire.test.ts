import { describe, it, expect } from 'vitest';
import { cleanNumber, validateLoanWire, validateTaxWire, loanFromWire, taxFromWire, type LoanInputWire } from './emiWire.js';

const ok: LoanInputWire = { principal: '1000000', annualRatePct: '8.5', tenureMonths: 240, firstEmiDate: '2026-11-05' };
const fields = (w: LoanInputWire) => validateLoanWire(w).map((e) => e.field);

describe('cleanNumber', () => {
  it('accepts Indian grouping and the rupee sign', () => {
    expect(cleanNumber('10,00,000')).toBe('1000000');
    expect(cleanNumber(' ₹ 25,00,000.50 ')).toBe('2500000.50');
  });
});

describe('validateLoanWire', () => {
  it('accepts a valid loan', () => expect(validateLoanWire(ok)).toEqual([]));
  it('accepts Indian-formatted amounts', () => expect(validateLoanWire({ ...ok, principal: '₹ 10,00,000' })).toEqual([]));
  it.each([
    [{ principal: '0' }, 'principal'],
    [{ principal: 'abc' }, 'principal'],
    [{ principal: '1000000001' }, 'principal'],
    [{ annualRatePct: '51' }, 'annualRatePct'],
    [{ annualRatePct: '-1' }, 'annualRatePct'],
    [{ tenureMonths: 0 }, 'tenureMonths'],
    [{ tenureMonths: 481 }, 'tenureMonths'],
    [{ tenureMonths: 12.5 }, 'tenureMonths'],
    [{ firstEmiDate: '2026-02-30' }, 'firstEmiDate'],
    [{ firstEmiDate: '05/11/2026' }, 'firstEmiDate'],
    [{ emiOverride: '0' }, 'emiOverride'],
  ])('rejects %o', (patch, field) => expect(fields({ ...ok, ...patch } as LoanInputWire)).toContain(field));
  it('names the failing prepayment / rate change / fee field', () => {
    const errs = fields({
      ...ok,
      prepayments: [{ month: 0, amount: '-5', recurrence: 'ONCE', mode: 'REDUCE_TENURE' }],
      rateChanges: [{ fromMonth: 3, annualRatePct: '99', mode: 'REDUCE_EMI' }],
      fees: { processingFeeKind: 'PCT', processingFeeValue: '11', gstPct: '30', otherCharges: 'x' },
    });
    expect(errs).toEqual(expect.arrayContaining([
      'prepayments.0.month', 'prepayments.0.amount', 'rateChanges.0.annualRatePct',
      'fees.processingFeeValue', 'fees.gstPct', 'fees.otherCharges',
    ]));
  });
});

describe('validateTaxWire', () => {
  it('limits slab and 80C room', () => {
    const errs = validateTaxWire({ regime: 'OLD', loanKind: 'HOME_SELF', slabPct: '31', remaining80C: '150001' }).map((e) => e.field);
    expect(errs).toEqual(['tax.slabPct', 'tax.remaining80C']);
  });
});

describe('fromWire', () => {
  it('converts to Decimals after cleaning', () => {
    const l = loanFromWire({ ...ok, principal: '10,00,000', fees: { processingFeeKind: 'PCT', processingFeeValue: '0.5', gstPct: '18', otherCharges: '1,000' } });
    expect(l.principal.toString()).toBe('1000000');
    expect(l.fees!.otherCharges.toString()).toBe('1000');
    const t = taxFromWire({ regime: 'OLD', loanKind: 'HOME_SELF', slabPct: '30', remaining80C: '1,50,000' });
    expect(t.remaining80C.toString()).toBe('150000');
  });
});
