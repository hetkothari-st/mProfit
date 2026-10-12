import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import { buildEmiSchedule } from './emi.js';
import type { LoanInput } from './emi.types.js';

const D = (v: string | number) => new Decimal(v);
const base: LoanInput = { principal: D(1000000), annualRatePct: D('8.5'), tenureMonths: 240, firstEmiDate: '2026-11-05' };
const plain = buildEmiSchedule(base);

function invariants(r: ReturnType<typeof buildEmiSchedule>, principal: Decimal) {
  expect(r.schedule.at(-1)!.closing.toFixed(2)).toBe('0.00');
  expect(r.totalPrincipal.plus(r.totalPrepaid).equals(principal)).toBe(true);
  for (const row of r.schedule) expect(row.closing.gte(0)).toBe(true);
}

describe('prepayments', () => {
  it('REDUCE_TENURE keeps the EMI and shortens the loan', () => {
    const r = buildEmiSchedule({ ...base, prepayments: [{ month: 12, amount: D(100000), recurrence: 'ONCE', mode: 'REDUCE_TENURE' }] });
    invariants(r, base.principal);
    expect(r.months).toBeLessThan(240);
    expect(r.schedule[20]!.emi.equals(plain.emi)).toBe(true);
    expect(r.totalInterest.lt(plain.totalInterest)).toBe(true);
    expect(r.schedule[11]!.prepayment.toFixed(2)).toBe('100000.00');
  });

  it('REDUCE_EMI keeps the tenure and lowers the EMI', () => {
    const r = buildEmiSchedule({ ...base, prepayments: [{ month: 12, amount: D(100000), recurrence: 'ONCE', mode: 'REDUCE_EMI' }] });
    invariants(r, base.principal);
    expect(r.months).toBe(240);
    expect(r.schedule[12]!.emi.lt(plain.emi)).toBe(true);
  });

  it('YEARLY repeats every 12 months', () => {
    const r = buildEmiSchedule({ ...base, prepayments: [{ month: 12, amount: D(50000), recurrence: 'YEARLY', mode: 'REDUCE_TENURE' }] });
    invariants(r, base.principal);
    expect(r.schedule[11]!.prepayment.toFixed(0)).toBe('50000');
    expect(r.schedule[23]!.prepayment.toFixed(0)).toBe('50000');
    expect(r.schedule[22]!.prepayment.toFixed(0)).toBe('0');
  });

  it('a prepayment larger than the balance closes the loan and warns', () => {
    const r = buildEmiSchedule({ ...base, prepayments: [{ month: 3, amount: D(5000000), recurrence: 'ONCE', mode: 'REDUCE_TENURE' }] });
    invariants(r, base.principal);
    expect(r.months).toBe(3);
    expect(r.warnings).toContain('PREPAYMENT_CAPPED');
  });

  it('a prepayment after closure is ignored with a warning', () => {
    const r = buildEmiSchedule({
      ...base,
      prepayments: [
        { month: 3, amount: D(990000), recurrence: 'ONCE', mode: 'REDUCE_TENURE' },
        { month: 200, amount: D(1000), recurrence: 'ONCE', mode: 'REDUCE_TENURE' },
      ],
    });
    invariants(r, base.principal);
    expect(r.months).toBeLessThan(200);
    expect(r.warnings).toContain('PREPAYMENT_AFTER_CLOSE');
  });
});

describe('rate changes', () => {
  it('REDUCE_TENURE (keep EMI): a cut shortens the loan, EMI unchanged', () => {
    const r = buildEmiSchedule({ ...base, rateChanges: [{ fromMonth: 25, annualRatePct: D('7.5'), mode: 'REDUCE_TENURE' }] });
    invariants(r, base.principal);
    expect(r.months).toBeLessThan(240);
    expect(r.schedule[30]!.emi.equals(plain.emi)).toBe(true);
    expect(r.schedule[24]!.ratePct.toString()).toBe('7.5');
  });

  it('REDUCE_EMI (keep tenure): a rise raises the EMI, tenure unchanged', () => {
    const r = buildEmiSchedule({ ...base, rateChanges: [{ fromMonth: 25, annualRatePct: D('10'), mode: 'REDUCE_EMI' }] });
    invariants(r, base.principal);
    expect(r.months).toBe(240);
    expect(r.schedule[30]!.emi.gt(plain.emi)).toBe(true);
  });

  it('a rise that the kept EMI cannot cover recomputes the EMI and warns', () => {
    const r = buildEmiSchedule({ ...base, rateChanges: [{ fromMonth: 13, annualRatePct: D('15'), mode: 'REDUCE_TENURE' }] });
    invariants(r, base.principal);
    expect(r.warnings).toContain('NEGATIVE_AMORTISATION_AVOIDED');
    expect(r.schedule[20]!.emi.gt(plain.emi)).toBe(true);
  });

  it('a change after closure is ignored with a warning', () => {
    const r = buildEmiSchedule({ ...base, tenureMonths: 12, principal: D(100000), rateChanges: [{ fromMonth: 30, annualRatePct: D(9), mode: 'REDUCE_EMI' }] });
    expect(r.months).toBe(12);
    expect(r.warnings).toContain('RATE_CHANGE_AFTER_CLOSE');
  });
});

describe('extreme inputs', () => {
  it('Rs 100 crore at 50% over 480 months closes exactly', () => {
    const principal = D(1000000000);
    const r = buildEmiSchedule({ principal, annualRatePct: D(50), tenureMonths: 480, firstEmiDate: '2026-11-05' });
    expect(r.schedule.at(-1)!.closing.toFixed(2)).toBe('0.00');
    expect(r.totalPrincipal.equals(principal)).toBe(true);
    expect(r.schedule.at(-1)!.emi.lte(r.schedule[0]!.emi)).toBe(true);
  });
});
