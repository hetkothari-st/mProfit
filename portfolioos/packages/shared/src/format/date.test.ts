import { describe, it, expect } from 'vitest';
import { calendarDaysBetweenIST, financialYearOf, istCalendarDate } from './date.js';
import { financialYearFromDate } from '../finance/cii.js';

describe('Indian calendar dates', () => {
  it('reads a late-UTC instant as the next Indian date', () => {
    // 20:00 UTC on 31 Mar is 01:30 on 1 Apr in India.
    expect(istCalendarDate(new Date('2025-03-31T20:00:00Z'))).toBe('2025-04-01');
    expect(istCalendarDate(new Date('2025-03-31T00:00:00Z'))).toBe('2025-03-31');
  });

  it('puts the financial year on the Indian date, whatever the server zone', () => {
    expect(financialYearOf(new Date('2025-03-31T20:00:00Z'))).toBe('2025-26');
    expect(financialYearOf(new Date('2025-03-31T00:00:00Z'))).toBe('2024-25');
    expect(financialYearFromDate('2025-04-01')).toBe('2025-26');
  });

  it('counts calendar days on Indian dates', () => {
    // Bought on 17 Sep 2025; viewed at 02:00 IST on 17 Sep 2026 = 20:30 UTC on 16 Sep.
    expect(calendarDaysBetweenIST(new Date('2025-09-17T00:00:00Z'), new Date('2026-09-16T20:30:00Z'))).toBe(365);
  });
});
