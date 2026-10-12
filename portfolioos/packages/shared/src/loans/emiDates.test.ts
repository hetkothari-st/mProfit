import { describe, it, expect } from 'vitest';
import { addMonthsIso, indianFy } from './emiDates.js';

describe('addMonthsIso', () => {
  it('adds months within a year', () => expect(addMonthsIso('2026-11-05', 1)).toBe('2026-12-05'));
  it('rolls the year', () => expect(addMonthsIso('2026-12-05', 1)).toBe('2027-01-05'));
  it('clamps the 31st to the month end and returns to 31 later', () => {
    expect(addMonthsIso('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsIso('2027-01-31', 2)).toBe('2027-03-31');
    expect(addMonthsIso('2027-01-31', 3)).toBe('2027-04-30');
  });
  it('handles zero and large offsets', () => {
    expect(addMonthsIso('2026-10-12', 0)).toBe('2026-10-12');
    expect(addMonthsIso('2026-10-12', 480)).toBe('2066-10-12');
  });
  it('rejects malformed dates', () => expect(() => addMonthsIso('12/10/2026', 1)).toThrow(/date/i));
});

describe('indianFy', () => {
  it('April starts the FY', () => expect(indianFy('2026-04-01')).toBe('2026-27'));
  it('March belongs to the previous FY', () => expect(indianFy('2027-03-31')).toBe('2026-27'));
  it('century wrap', () => expect(indianFy('2099-05-01')).toBe('2099-00'));
});
