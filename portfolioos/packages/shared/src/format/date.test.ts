import { describe, it, expect } from 'vitest';
import { formatDateIST, formatDateTimeIST, formatDateOnly, calendarDaysBetweenIST, financialYearOf, istCalendarDate } from './date.js';
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

describe('dd/mm/yyyy display formatting', () => {
  it('formats dates numerically', () => {
    expect(formatDateIST('2026-10-08')).toBe('08/10/2026');
    expect(formatDateIST('2026-10-08T20:00:00Z')).toBe('09/10/2026');
    expect(formatDateIST(null)).toBe('-');
  });
  it('formats date-times with lower-case am/pm', () => {
    expect(formatDateTimeIST('2026-10-08T05:59:00Z')).toBe('08/10/2026, 11:29 am');
    expect(formatDateTimeIST('2026-10-08T12:30:00Z')).toBe('08/10/2026, 06:00 pm');
  });
  it('formats date-only strings without a timezone shift', () => {
    expect(formatDateOnly('2026-10-08')).toBe('08/10/2026');
    expect(formatDateOnly('2026-10-08T23:59:00Z')).toBe('08/10/2026');
    expect(formatDateOnly(undefined)).toBe('-');
  });
});
