import { describe, it, expect } from 'vitest';
import { spanDays, isXirrReliable, MIN_XIRR_DAYS } from './xirr.reliability.js';

describe('xirr reliability', () => {
  const d = (s: string) => new Date(s);
  it('computes span between earliest and latest flow date', () => {
    expect(spanDays([d('2026-01-01'), d('2026-04-01')])).toBe(90);
  });
  it('is order-independent', () => {
    expect(spanDays([d('2026-04-01'), d('2026-01-01')])).toBe(90);
  });
  it('returns 0 for empty or single date', () => {
    expect(spanDays([])).toBe(0);
    expect(spanDays([d('2026-01-01')])).toBe(0);
  });
  it('marks sub-90-day windows unreliable', () => {
    expect(isXirrReliable(spanDays([d('2026-05-01'), d('2026-05-22')]))).toBe(false);
  });
  it('marks >=90-day windows reliable', () => {
    expect(isXirrReliable(MIN_XIRR_DAYS)).toBe(true);
    expect(isXirrReliable(400)).toBe(true);
  });
});
