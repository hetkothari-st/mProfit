/**
 * NAV ingest validation — one case per rule in
 * `docs/mf-analytics/01-DATA-FOUNDATION.md §6`, plus the case that actually
 * matters in production: a large move that IS explained by a corporate action
 * must not be quarantined.
 *
 * Everything under test is pure — no DB, no `scope.runAs`, no network.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import {
  quarantineNavSeries,
  isNonBusinessDay,
  utcDayKey,
  DEFAULT_NAV_JUMP_THRESHOLD,
  type NavPointInput,
} from '../../src/priceFeeds/navQuarantine.js';

/** UTC-midnight date from an ISO day string, matching Prisma's `@db.Date`. */
const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const nav = (v: string): Decimal => new Decimal(v);

interface Row extends NavPointInput {
  id: string;
}
const row = (id: string, iso: string, v: NavPointInput['nav']): Row => ({
  id,
  date: d(iso),
  nav: v,
});

// 2026-01-05 is a Monday, so 01-09 Fri, 01-10 Sat, 01-11 Sun, 01-12 Mon.
describe('isNonBusinessDay', () => {
  it('flags Saturday and Sunday only', () => {
    expect(isNonBusinessDay(d('2026-01-10'))).toBe(true); // Sat
    expect(isNonBusinessDay(d('2026-01-11'))).toBe(true); // Sun
    expect(isNonBusinessDay(d('2026-01-09'))).toBe(false); // Fri
    expect(isNonBusinessDay(d('2026-01-12'))).toBe(false); // Mon
  });

  it('does NOT guess Indian market holidays', () => {
    // 2026-01-26 is Republic Day (a Monday) — markets shut, but we have no
    // holiday calendar and a false quarantine is worse than a missed one, so
    // the row stays clean. If a calendar is ever seeded this expectation is
    // the one to revisit.
    expect(isNonBusinessDay(d('2026-01-26'))).toBe(false);
  });
});

describe('quarantineNavSeries — 01 §6 rules', () => {
  it('partitions every input row into exactly one bucket', () => {
    const rows = [
      row('a', '2026-01-05', nav('100')),
      row('b', '2026-01-06', nav('0')),
      row('c', '2026-01-07', nav('101')),
    ];
    const { clean, quarantined } = quarantineNavSeries(rows);
    expect(clean.length + quarantined.length).toBe(rows.length);
  });

  it('quarantines nav <= 0 as nav_nonpositive', () => {
    const { clean, quarantined } = quarantineNavSeries([
      row('a', '2026-01-05', nav('100')),
      row('b', '2026-01-06', nav('0')),
      row('c', '2026-01-07', nav('-3.5')),
    ]);
    expect(clean.map((r) => r.id)).toEqual(['a']);
    expect(quarantined.map((q) => [q.row.id, q.reason])).toEqual([
      ['b', 'nav_nonpositive'],
      ['c', 'nav_nonpositive'],
    ]);
  });

  it('quarantines a missing or unparseable nav as nav_nonpositive', () => {
    const { clean, quarantined } = quarantineNavSeries([
      row('a', '2026-01-05', nav('100')),
      row('b', '2026-01-06', null),
      row('c', '2026-01-07', undefined),
      row('d', '2026-01-08', 'N.A.'),
    ]);
    expect(clean.map((r) => r.id)).toEqual(['a']);
    expect(quarantined.map((q) => q.reason)).toEqual([
      'nav_nonpositive',
      'nav_nonpositive',
      'nav_nonpositive',
    ]);
    expect(quarantined[1]?.detail).toContain('missing');
  });

  it('quarantines a day-over-day move greater than 20% as nav_jump', () => {
    const { clean, quarantined } = quarantineNavSeries([
      row('a', '2026-01-05', nav('100')),
      row('b', '2026-01-06', nav('125')), // +25%
    ]);
    expect(clean.map((r) => r.id)).toEqual(['a']);
    expect(quarantined[0]?.reason).toBe('nav_jump');
    expect(quarantined[0]?.detail).toContain('25.00%');
  });

  it('does not quarantine a move of exactly the threshold (rule is strictly >)', () => {
    const { clean, quarantined } = quarantineNavSeries([
      row('a', '2026-01-05', nav('100')),
      row('b', '2026-01-06', nav('120')), // exactly +20%
    ]);
    expect(quarantined).toHaveLength(0);
    expect(clean).toHaveLength(2);
    expect(DEFAULT_NAV_JUMP_THRESHOLD.toString()).toBe('0.2');
  });

  it('does NOT quarantine a 25% jump that has a matching corporate action', () => {
    // The case that matters: a 1:2 split or a scheme merger legitimately moves
    // the NAV. Quarantining it would punch a hole in the series on exactly the
    // day the series is most interesting.
    const rows = [
      row('a', '2026-01-05', nav('100')),
      row('b', '2026-01-06', nav('125')),
    ];
    const { clean, quarantined } = quarantineNavSeries(rows, {
      knownActionDates: [d('2026-01-06')],
    });
    expect(quarantined).toHaveLength(0);
    expect(clean.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('only accepts an action inside the window since the last clean row', () => {
    // An action the day BEFORE the previous observation was already priced in;
    // it cannot explain today's move.
    const rows = [
      row('a', '2026-01-05', nav('100')),
      row('b', '2026-01-06', nav('125')),
    ];
    const { quarantined } = quarantineNavSeries(rows, {
      knownActionDates: [d('2026-01-02')],
    });
    expect(quarantined.map((q) => q.reason)).toEqual(['nav_jump']);
  });

  it('quarantines a weekend NAV that differs from the previous one', () => {
    const { clean, quarantined } = quarantineNavSeries([
      row('fri', '2026-01-09', nav('100')),
      row('sat', '2026-01-10', nav('100.5')),
    ]);
    expect(clean.map((r) => r.id)).toEqual(['fri']);
    expect(quarantined[0]?.reason).toBe('nav_weekend_anomaly');
  });

  it('leaves a weekend NAV alone when it merely repeats the previous value', () => {
    const { clean, quarantined } = quarantineNavSeries([
      row('fri', '2026-01-09', nav('100')),
      row('sat', '2026-01-10', nav('100')),
      row('sun', '2026-01-11', nav('100')),
      row('mon', '2026-01-12', nav('100.4')),
    ]);
    expect(quarantined).toHaveLength(0);
    expect(clean).toHaveLength(4);
  });

  it('reports nav_jump rather than nav_weekend_anomaly when both apply', () => {
    const { quarantined } = quarantineNavSeries([
      row('fri', '2026-01-09', nav('100')),
      row('sat', '2026-01-10', nav('150')),
    ]);
    expect(quarantined.map((q) => q.reason)).toEqual(['nav_jump']);
  });

  it('anchors on the last CLEAN row, so a spike is quarantined once, not twice', () => {
    const { clean, quarantined } = quarantineNavSeries([
      row('a', '2026-01-05', nav('100')),
      row('b', '2026-01-06', nav('200')), // spike
      row('c', '2026-01-07', nav('101')), // back to normal vs. `a`
    ]);
    expect(quarantined.map((q) => q.row.id)).toEqual(['b']);
    expect(clean.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('never lets a quarantined row become the comparison baseline', () => {
    const { clean } = quarantineNavSeries([
      row('a', '2026-01-05', nav('100')),
      row('b', '2026-01-06', nav('0')), // dropped, not a baseline
      row('c', '2026-01-07', nav('102')),
    ]);
    expect(clean.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('sorts by date and does not mutate the caller array', () => {
    const rows = [
      row('c', '2026-01-07', nav('102')),
      row('a', '2026-01-05', nav('100')),
      row('b', '2026-01-06', nav('101')),
    ];
    const snapshot = rows.map((r) => r.id);
    const { clean } = quarantineNavSeries(rows);
    expect(clean.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rows.map((r) => r.id)).toEqual(snapshot);
  });

  it('honours a custom jump threshold', () => {
    const { quarantined } = quarantineNavSeries(
      [row('a', '2026-01-05', nav('100')), row('b', '2026-01-06', nav('105'))],
      { jumpThreshold: new Decimal('0.01') },
    );
    expect(quarantined.map((q) => q.reason)).toEqual(['nav_jump']);
  });

  it('never throws, whatever it is fed', () => {
    expect(() =>
      quarantineNavSeries([
        row('a', '2026-01-05', 'not-a-number'),
        row('b', '2026-01-06', Number.NaN),
        row('c', '2026-01-07', Number.POSITIVE_INFINITY),
        row('d', '2026-01-08', {} as unknown as string),
      ]),
    ).not.toThrow();
  });

  it('normalises a date carrying a time-of-day to its UTC day', () => {
    expect(utcDayKey(new Date('2026-01-10T18:45:00.000Z'))).toBe(utcDayKey(d('2026-01-10')));
  });
});
