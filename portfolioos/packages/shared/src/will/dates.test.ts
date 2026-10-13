import { describe, it, expect } from 'vitest';
import { isRealIsoDate } from './dates.js';

describe('isRealIsoDate', () => {
  it('accepts real dates including leap days', () => {
    expect(isRealIsoDate('2024-02-29')).toBe(true);
    expect(isRealIsoDate('2026-10-12')).toBe(true);
  });
  it('rejects impossible and malformed input without throwing', () => {
    for (const v of ['2026-02-31', '2026-13-01', '2025-02-29', '05/01/1990', '', null, 5]) expect(isRealIsoDate(v)).toBe(false);
  });
});
