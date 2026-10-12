import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import { emiFor, maxLoanFor, tenureForEmi, buildEmiSchedule } from './emi.js';
import { EmiError } from './emi.types.js';

const D = (v: string | number) => new Decimal(v);

describe('emiFor', () => {
  // Reference values computed with the standard formula at 40-digit precision, then rounded UP to the rupee.
  it.each([
    ['1000000', '8.5', 240, '8679'],   // 8678.23
    ['500000', '10.5', 60, '10747'],   // 10746.95
    ['2500000', '9', 360, '20116'],    // 20115.57
    ['100000', '12', 12, '8885'],      // 8884.88
    ['120000', '0', 12, '10000'],
  ])('P=%s r=%s n=%s -> %s', (p, r, n, want) => {
    expect(emiFor(D(p), D(r), n).toFixed(0)).toBe(want);
  });
  it('rejects tenure < 1', () => expect(() => emiFor(D(1000), D(10), 0)).toThrow(EmiError));
});

describe('reverse solvers', () => {
  it('maxLoanFor rounds down to the rupee', () => {
    expect(maxLoanFor(D(8679), D('8.5'), 240).toFixed(0)).toBe('1000088');
    expect(maxLoanFor(D(10000), D(0), 12).toFixed(0)).toBe('120000');
  });
  it('tenureForEmi rounds months up', () => {
    expect(tenureForEmi(D(1000000), D(10000), D('8.5'))).toBe(175);
    expect(tenureForEmi(D(120000), D(10000), D(0))).toBe(12);
    expect(tenureForEmi(D(120000), D(7000), D(0))).toBe(18);
  });
  it('tenureForEmi throws EMI_TOO_LOW when EMI does not cover interest', () => {
    try { tenureForEmi(D(1000000), D(7083), D('8.5')); expect.unreachable(); }
    catch (e) { expect((e as EmiError).code).toBe('EMI_TOO_LOW'); }
  });
});

describe('buildEmiSchedule (plain)', () => {
  const base = { principal: D(1000000), annualRatePct: D('8.5'), tenureMonths: 240, firstEmiDate: '2026-11-05' };

  it('matches reference totals and closes at exactly 0', () => {
    const r = buildEmiSchedule(base);
    expect(r.emi.toFixed(0)).toBe('8679');
    expect(r.months).toBe(240);
    expect(r.totalInterest.toFixed(2)).toBe('1082478.64');
    expect(r.schedule.at(-1)!.emi.toFixed(2)).toBe('8197.64');
    expect(r.schedule.at(-1)!.closing.toFixed(2)).toBe('0.00');
    expect(r.totalPrincipal.toFixed(2)).toBe('1000000.00');
    expect(r.totalPaid.equals(r.totalPrincipal.plus(r.totalInterest))).toBe(true);
    expect(r.schedule[0]!.date).toBe('2026-11-05');
    expect(r.schedule[1]!.date).toBe('2026-12-05');
  });

  it('short loan reference', () => {
    const r = buildEmiSchedule({ ...base, principal: D(100000), annualRatePct: D(12), tenureMonths: 12 });
    expect(r.totalInterest.toFixed(2)).toBe('6618.46');
    expect(r.schedule.at(-1)!.emi.toFixed(2)).toBe('8883.46');
  });

  it('zero-rate loan', () => {
    const r = buildEmiSchedule({ ...base, principal: D(120000), annualRatePct: D(0), tenureMonths: 12 });
    expect(r.totalInterest.toFixed(2)).toBe('0.00');
    expect(r.months).toBe(12);
  });

  it('closing is never negative and every row is internally consistent', () => {
    const r = buildEmiSchedule({ ...base, principal: D('2500000'), annualRatePct: D(9), tenureMonths: 360 });
    for (const row of r.schedule) {
      expect(row.closing.gte(0)).toBe(true);
      expect(row.opening.minus(row.principal).minus(row.prepayment).equals(row.closing)).toBe(true);
      expect(row.emi.equals(row.interest.plus(row.principal))).toBe(true);
    }
  });

  it('emiOverride drives tenure', () => {
    const r = buildEmiSchedule({ ...base, emiOverride: D(10000) });
    expect(r.emi.toFixed(0)).toBe('10000');
    expect(r.months).toBe(175);
    expect(r.schedule.at(-1)!.closing.toFixed(2)).toBe('0.00');
  });
});

describe('buildEmiSchedule never returns a non-closing schedule', () => {
  it('an EMI of Rs 1 on Rs 1 crore at 0% throws instead of stopping part-way', () => {
    expect(() => buildEmiSchedule({ principal: D(10000000), annualRatePct: D(0), tenureMonths: 12, firstEmiDate: '2026-11-05', emiOverride: D(1) }))
      .toThrow(/100 years/);
  });
});
