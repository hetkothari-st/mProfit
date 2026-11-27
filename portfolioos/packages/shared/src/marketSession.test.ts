import { describe, expect, it } from 'vitest';
import { isSessionPriceStale, latestExpectedSession, NAV_AVAILABLE_IST } from './marketSession.js';

// Trading-day prices are stored at UTC midnight of the trading day.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
// Wall-clock moments given in IST.
const ist = (isoLocal: string) => new Date(`${isoLocal}+05:30`);

// 2026-11-20 is a Friday.
describe('stock price freshness by trading session', () => {
  it('a Friday close read on Sunday is current', () => {
    expect(isSessionPriceStale(day('2026-11-20'), ist('2026-11-22T11:00:00'))).toBe(false);
  });

  it('a Friday close read on Monday morning, before the close is out, is current', () => {
    expect(latestExpectedSession(ist('2026-11-23T10:00:00'), { hour: 16, minute: 30 }).toISOString().slice(0, 10)).toBe('2026-11-20');
    expect(isSessionPriceStale(day('2026-11-20'), ist('2026-11-23T10:00:00'))).toBe(false);
  });

  it('a Friday close on Monday evening is one session behind: allowed for a holiday', () => {
    expect(isSessionPriceStale(day('2026-11-20'), ist('2026-11-23T18:00:00'))).toBe(false);
  });

  it('a Friday close on Tuesday evening is two sessions behind: stale', () => {
    expect(isSessionPriceStale(day('2026-11-20'), ist('2026-11-24T18:00:00'))).toBe(true);
  });

  it('today’s price is current all day', () => {
    expect(isSessionPriceStale(day('2026-11-24'), ist('2026-11-24T12:00:00'))).toBe(false);
  });

  it('mutual fund NAVs use the later publication time', () => {
    // Tuesday 18:00: Tuesday's NAV is not out yet, so Monday's is the latest.
    expect(latestExpectedSession(ist('2026-11-24T18:00:00'), NAV_AVAILABLE_IST).toISOString().slice(0, 10)).toBe('2026-11-23');
    expect(isSessionPriceStale(day('2026-11-20'), ist('2026-11-24T18:00:00'), NAV_AVAILABLE_IST)).toBe(false);
  });
});
