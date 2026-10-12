import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import { loanTaxBenefit } from './emiTax.js';
import type { ScheduleRow } from './emi.types.js';

const D = (v: string | number) => new Decimal(v);
/** One row per month from `start`, fixed interest/principal, for clean FY sums. */
function rows(start: string, count: number, interest: number, principal: number): ScheduleRow[] {
  const out: ScheduleRow[] = [];
  let y = Number(start.slice(0, 4));
  let mo = Number(start.slice(5, 7));
  for (let i = 0; i < count; i++) {
    out.push({
      month: i + 1, date: `${y}-${String(mo).padStart(2, '0')}-05`,
      opening: D(0), emi: D(interest + principal), interest: D(interest), principal: D(principal),
      prepayment: D(0), closing: D(0), ratePct: D(9),
    });
    mo += 1; if (mo === 13) { mo = 1; y += 1; }
  }
  return out;
}

describe('loanTaxBenefit', () => {
  const old30 = { regime: 'OLD' as const, slabPct: D(30), remaining80C: D(150000) };

  it('home self-occupied: interest capped at 2L, principal at 80C room, cess 4%', () => {
    // 12 months Apr-Mar: interest 2.4L, principal 1.2L.
    const t = loanTaxBenefit(rows('2026-04-05', 12, 20000, 10000), { ...old30, loanKind: 'HOME_SELF' });
    expect(t.years).toHaveLength(1);
    const y = t.years[0]!;
    expect(y.fy).toBe('2026-27');
    expect(y.interestDeduction.toFixed(0)).toBe('200000');
    expect(y.principalDeduction.toFixed(0)).toBe('120000');
    // (200000 + 120000) * 30% * 1.04 = 99840
    expect(y.taxSaved.toFixed(2)).toBe('99840.00');
  });

  it('principal limited by remaining 80C room', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 12, 1000, 20000), { ...old30, remaining80C: D(50000), loanKind: 'HOME_SELF' });
    expect(t.years[0]!.principalDeduction.toFixed(0)).toBe('50000');
  });

  it('let-out: set-off capped at 2L, excess carried forward', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 12, 30000, 0), { ...old30, loanKind: 'HOME_LET_OUT' });
    expect(t.years[0]!.interestDeduction.toFixed(0)).toBe('200000');
    expect(t.years[0]!.carriedForward.toFixed(0)).toBe('160000');
  });

  it('education: interest only, first 8 FYs only, no 80C', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 120, 5000, 5000), { ...old30, loanKind: 'EDUCATION' });
    expect(t.years).toHaveLength(10);
    expect(t.years[0]!.interestDeduction.toFixed(0)).toBe('60000');
    expect(t.years[0]!.principalDeduction.toFixed(0)).toBe('0');
    expect(t.years[7]!.interestDeduction.toFixed(0)).toBe('60000');
    expect(t.years[8]!.interestDeduction.toFixed(0)).toBe('0');
  });

  it('splits by FY across a March/April boundary', () => {
    const t = loanTaxBenefit(rows('2027-02-05', 3, 1000, 1000), { ...old30, loanKind: 'HOME_SELF' });
    expect(t.years.map((y) => y.fy)).toEqual(['2026-27', '2027-28']);
    expect(t.years[0]!.interest.toFixed(0)).toBe('2000');
    expect(t.years[1]!.interest.toFixed(0)).toBe('1000');
  });

  it('new regime gives zero with a note', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 12, 20000, 10000), { ...old30, regime: 'NEW', loanKind: 'HOME_SELF' });
    expect(t.totalTaxSaved.toFixed(2)).toBe('0.00');
    expect(t.note).toMatch(/new tax regime/i);
  });

  it('NONE loan kind gives zero', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 12, 20000, 10000), { ...old30, loanKind: 'NONE' });
    expect(t.totalTaxSaved.toFixed(2)).toBe('0.00');
  });
});

describe('loanTaxBenefit - more cases', () => {
  const old30 = { regime: 'OLD' as const, slabPct: D(30), remaining80C: D(150000) };
  it('let-out: principal is deducted under 80C', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 12, 10000, 8000), { ...old30, loanKind: 'HOME_LET_OUT' });
    expect(t.years[0]!.principalDeduction.toFixed(0)).toBe('96000');
    expect(t.years[0]!.carriedForward.toFixed(0)).toBe('0');
  });
  it('a prepayment counts toward 80C', () => {
    const r = rows('2026-04-05', 12, 1000, 2000);
    r[5] = { ...r[5]!, prepayment: D(50000) };
    const t = loanTaxBenefit(r, { ...old30, loanKind: 'HOME_SELF' });
    expect(t.years[0]!.principal.toFixed(0)).toBe('74000');
    expect(t.years[0]!.principalDeduction.toFixed(0)).toBe('74000');
  });
  it('interest under the 24(b) cap is deducted in full', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 12, 15000, 0), { ...old30, loanKind: 'HOME_SELF' });
    expect(t.years[0]!.interestDeduction.toFixed(0)).toBe('180000');
    // 180000 * 30% * 1.04
    expect(t.years[0]!.taxSaved.toFixed(2)).toBe('56160.00');
  });
});
