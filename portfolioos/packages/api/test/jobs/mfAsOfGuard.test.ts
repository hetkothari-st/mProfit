/**
 * The guard is only worth having if it fires on exactly the right dates —
 * a false negative costs the afternoon it was written to save, and a false
 * positive trains people to ignore it. Month ends are the awkward cases:
 * 28/29/30/31 all occur, and February moves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isMonthEnd, warnIfNotMonthEnd } from '../../src/jobs/mfAsOfGuard.js';
import { logger } from '../../src/lib/logger.js';

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('isMonthEnd', () => {
  it('accepts 31-day month ends', () => {
    expect(isMonthEnd(utc('2026-01-31'))).toBe(true);
    expect(isMonthEnd(utc('2026-12-31'))).toBe(true);
  });

  it('accepts 30-day month ends', () => {
    expect(isMonthEnd(utc('2026-04-30'))).toBe(true);
    expect(isMonthEnd(utc('2026-09-30'))).toBe(true);
  });

  it('accepts February in a common year and a leap year', () => {
    expect(isMonthEnd(utc('2026-02-28'))).toBe(true);
    expect(isMonthEnd(utc('2028-02-29'))).toBe(true);
  });

  it('rejects the day before a month end', () => {
    expect(isMonthEnd(utc('2026-01-30'))).toBe(false);
    expect(isMonthEnd(utc('2026-04-29'))).toBe(false);
    expect(isMonthEnd(utc('2026-02-27'))).toBe(false);
  });

  it('rejects 28 February in a leap year', () => {
    // The case a naive "is it the 28th?" check gets wrong.
    expect(isMonthEnd(utc('2028-02-28'))).toBe(false);
  });

  it('rejects mid-month — the date that produced zero ratings', () => {
    expect(isMonthEnd(utc('2026-09-08'))).toBe(false);
  });
});

describe('warnIfNotMonthEnd', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('stays silent on a month end', () => {
    warnIfNotMonthEnd(utc('2026-08-31'), 'mf score job');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns mid-month and names the month end to use instead', () => {
    warnIfNotMonthEnd(utc('2026-09-08'), 'mf score job');
    expect(warn).toHaveBeenCalledTimes(1);

    const [meta, message] = warn.mock.calls[0] as [
      { job: string; asOf: string; suggestedAsOf: string },
      string,
    ];
    expect(meta.job).toBe('mf score job');
    expect(meta.asOf).toBe('2026-09-08');
    expect(meta.suggestedAsOf).toBe('2026-09-30');
    expect(message).toContain('mf score job');
    expect(message).toContain('2026-09-30');
  });

  it('suggests the correct month end in February of a leap year', () => {
    warnIfNotMonthEnd(utc('2028-02-10'), 'mf metrics job');
    const [meta] = warn.mock.calls[0] as [{ suggestedAsOf: string }, string];
    expect(meta.suggestedAsOf).toBe('2028-02-29');
  });
});
