import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  buildTradingCalendar,
  describeNavGap,
  largestNavGap,
} from '../../../../src/services/advisor/fundRanking/navGaps.js';
import {
  assessEligibility,
  readTraits,
} from '../../../../src/services/advisor/fundRanking/eligibility.js';
import type {
  FundCandidate,
  MethodologyConfig,
  NavObservation,
} from '../../../../src/services/advisor/fundRanking/types.js';

/**
 * The failure this rule catches: a fund whose NAV stopped for a month and
 * then resumed. `maxNavStalenessDays` sees a current NAV and passes it;
 * `minTrackRecordYears` sees a five-year span and passes it. Every metric
 * computed across the hole is wrong in a way the metric cannot report — a
 * rolling window that straddles it annualises a month's move as a day's.
 */

// ─── A fixture with a real hole in the middle ────────────────────
//
// Weekdays only, so the calendar below is a plausible trading calendar
// without needing a holiday table. The market prices every weekday; the
// fund skips 2026-03-05 .. 2026-04-01 inclusive.

function weekdays(fromIso: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${fromIso}T00:00:00.000Z`);
  while (out.length < count) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** 120 weekdays from 2026-01-01 — what the market priced on. */
const MARKET_DAYS = weekdays('2026-01-01', 120);
const CALENDAR = buildTradingCalendar(MARKET_DAYS);

const GAP_FROM = '2026-03-04';
const GAP_TO = '2026-04-02';

/** The same days, minus a 20-trading-day hole in March. */
const WITH_GAP: NavObservation[] = MARKET_DAYS.filter(
  (d) => d <= GAP_FROM || d >= GAP_TO,
).map((date, i) => ({ date, nav: 100 + i * 0.1 }));

const WITHOUT_GAP: NavObservation[] = MARKET_DAYS.map((date, i) => ({
  date,
  nav: 100 + i * 0.1,
}));

describe('buildTradingCalendar', () => {
  it('is the sorted unique set of dates anything priced on', () => {
    const cal = buildTradingCalendar(['2026-01-05', '2026-01-02', '2026-01-05']);
    expect(cal).toEqual(['2026-01-02', '2026-01-05']);
  });

  it('is empty for an empty universe', () => {
    expect(buildTradingCalendar([])).toEqual([]);
  });
});

describe('largestNavGap', () => {
  it('finds a hole in the middle and reports its span', () => {
    const gap = largestNavGap(WITH_GAP, CALENDAR);
    expect(gap).not.toBeNull();
    expect(gap!.from).toBe(GAP_FROM);
    expect(gap!.to).toBe(GAP_TO);
    // Every weekday strictly between 4 Mar and 2 Apr 2026.
    expect(gap!.tradingDaysMissing).toBe(
      MARKET_DAYS.filter((d) => d > GAP_FROM && d < GAP_TO).length,
    );
  });

  it('reports nothing for a fund that priced every trading day', () => {
    expect(largestNavGap(WITHOUT_GAP, CALENDAR)).toBeNull();
  });

  // The whole reason for a trading calendar rather than calendar days: a fund
  // that prices every weekday has no gap, even though every weekend is a
  // two-day hole in the calendar sense.
  it('does not see weekends as gaps', () => {
    const gap = largestNavGap(WITHOUT_GAP, CALENDAR);
    expect(gap).toBeNull();
  });

  // A holiday the whole market took is not this fund's fault, and is not in
  // the calendar at all — so it cannot count against anyone.
  it('does not see a market-wide holiday as a gap', () => {
    const holiday = MARKET_DAYS[10]!;
    const marketMinusHoliday = MARKET_DAYS.filter((d) => d !== holiday);
    const fund = marketMinusHoliday.map((date, i) => ({ date, nav: 100 + i }));
    expect(largestNavGap(fund, buildTradingCalendar(marketMinusHoliday))).toBeNull();
  });

  it('returns the largest hole when there are several', () => {
    const skip = new Set([MARKET_DAYS[5]!, ...MARKET_DAYS.slice(20, 28)]);
    const fund = MARKET_DAYS.filter((d) => !skip.has(d)).map((date, i) => ({
      date,
      nav: 100 + i,
    }));
    const gap = largestNavGap(fund, buildTradingCalendar(MARKET_DAYS));
    expect(gap!.tradingDaysMissing).toBe(8);
  });

  // A fund that launched mid-window has no NAV before its launch. That is a
  // short track record, which minTrackRecordYears judges — counting it here
  // would fail the same fund twice under two different names.
  it('ignores the run before the fund existed', () => {
    const launched = MARKET_DAYS.slice(60).map((date, i) => ({ date, nav: 100 + i }));
    expect(largestNavGap(launched, CALENDAR)).toBeNull();
  });

  // Likewise at the end: that is nav_stale's job.
  it('ignores a run after the fund stopped pricing', () => {
    const stopped = MARKET_DAYS.slice(0, 60).map((date, i) => ({ date, nav: 100 + i }));
    expect(largestNavGap(stopped, CALENDAR)).toBeNull();
  });

  it('measures nothing without a calendar, rather than falling back to calendar days', () => {
    expect(largestNavGap(WITH_GAP, [])).toBeNull();
  });

  it('measures nothing from a single observation', () => {
    expect(largestNavGap([{ date: '2026-01-01', nav: 10 }], CALENDAR)).toBeNull();
  });

  it('tolerates duplicate observations for one date', () => {
    const dupes = [...WITHOUT_GAP, ...WITHOUT_GAP];
    expect(largestNavGap(dupes, CALENDAR)).toBeNull();
  });

  it('describes a gap for a human', () => {
    expect(describeNavGap({ from: 'a', to: 'b', tradingDaysMissing: 18 })).toBe(
      'a..b (18 trading days)',
    );
    expect(describeNavGap({ from: 'a', to: 'b', tradingDaysMissing: 1 })).toBe(
      'a..b (1 trading day)',
    );
  });
});

// ─── Through eligibility ─────────────────────────────────────────

const CONFIG = {
  eligibility: {
    minTrackRecordYearsActive: 0,
    minTrackRecordYearsPassive: 0,
    minAumInr: 0,
    requireAum: false,
    requireDirectPlan: true,
    requireGrowthOption: true,
    requireOpenEnded: true,
    maxNavStalenessDays: 100_000,
    maxNavGapTradingDays: 5,
  },
} as unknown as MethodologyConfig;

function candidate(navHistory: NavObservation[]): FundCandidate {
  return {
    schemeCode: '120503',
    schemeName: 'Alpha Bluechip Fund',
    amcName: 'Alpha Mutual Fund',
    category: 'EQUITY',
    subCategory: 'Open Ended Schemes(Equity Scheme - Large Cap Fund)',
    isin: null,
    isActive: true,
    planType: 'Direct Plan',
    optionType: 'Growth Option',
    navHistory,
    terPct: 0.5,
    terJoinStatus: 'MATCHED',
    aumInr: new Decimal(10_000_000_000),
    managerTenureYears: null,
    benchmarkTri: null,
  };
}

// asOf is inside the fixture's own range, so nav_stale can never fire and
// only the gap rule is under test.
const AS_OF = new Date('2026-06-20T00:00:00.000Z');

describe('nav_history_gap', () => {
  it('excludes a fund with a mid-window hole, and records the span', () => {
    const r = assessEligibility(candidate(WITH_GAP), 'EQUITY_DOMESTIC', CONFIG, AS_OF, CALENDAR);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('nav_history_gap');

    const detail = r.detailedReasons.find(
      (d): d is Exclude<typeof d, string> => typeof d !== 'string',
    );
    expect(detail).toEqual({
      reason: 'nav_history_gap',
      from: GAP_FROM,
      to: GAP_TO,
      tradingDaysMissing: 20,
    });
  });

  it('admits a fund that priced every trading day', () => {
    const r = assessEligibility(candidate(WITHOUT_GAP), 'EQUITY_DOMESTIC', CONFIG, AS_OF, CALENDAR);
    expect(r.reasons).not.toContain('nav_history_gap');
    expect(r.eligible).toBe(true);
    expect(r.traits.navGap).toBeNull();
  });

  it('admits a hole at exactly the threshold', () => {
    const skip = new Set(MARKET_DAYS.slice(20, 25));
    const fund = MARKET_DAYS.filter((d) => !skip.has(d)).map((date, i) => ({
      date,
      nav: 100 + i,
    }));
    const r = assessEligibility(candidate(fund), 'EQUITY_DOMESTIC', CONFIG, AS_OF, CALENDAR);
    expect(r.traits.navGap!.tradingDaysMissing).toBe(5);
    expect(r.reasons).not.toContain('nav_history_gap');
  });

  it('excludes one trading day past the threshold', () => {
    const skip = new Set(MARKET_DAYS.slice(20, 26));
    const fund = MARKET_DAYS.filter((d) => !skip.has(d)).map((date, i) => ({
      date,
      nav: 100 + i,
    }));
    const r = assessEligibility(candidate(fund), 'EQUITY_DOMESTIC', CONFIG, AS_OF, CALENDAR);
    expect(r.traits.navGap!.tradingDaysMissing).toBe(6);
    expect(r.reasons).toContain('nav_history_gap');
  });

  it('uses the configured threshold over the default', () => {
    const loose = {
      ...CONFIG,
      eligibility: { ...CONFIG.eligibility, maxNavGapTradingDays: 30 },
    } as MethodologyConfig;
    const r = assessEligibility(candidate(WITH_GAP), 'EQUITY_DOMESTIC', loose, AS_OF, CALENDAR);
    expect(r.reasons).not.toContain('nav_history_gap');
  });

  // Absent from an older signed methodology, the rule still applies — a
  // config that predates the rule should not silently disable it.
  it('falls back to 5 trading days when the methodology does not say', () => {
    const silent = {
      ...CONFIG,
      eligibility: { ...CONFIG.eligibility, maxNavGapTradingDays: undefined },
    } as unknown as MethodologyConfig;
    const r = assessEligibility(candidate(WITH_GAP), 'EQUITY_DOMESTIC', silent, AS_OF, CALENDAR);
    expect(r.reasons).toContain('nav_history_gap');
  });

  // The gate measures gaps in SQL because it cannot load every NAV; it hands
  // the answer in on the candidate.
  it('prefers a gap the caller measured elsewhere', () => {
    const c = {
      ...candidate(WITHOUT_GAP),
      navGap: { from: '2025-01-02', to: '2025-02-10', tradingDaysMissing: 27 },
    };
    const r = assessEligibility(c, 'EQUITY_DOMESTIC', CONFIG, AS_OF, CALENDAR);
    expect(r.reasons).toContain('nav_history_gap');
    expect(r.traits.navGap!.tradingDaysMissing).toBe(27);
  });

  // Without a calendar the rule is silent rather than guessing from calendar
  // days, which would fail every fund over Diwali.
  it('does not fire when no calendar was supplied', () => {
    const r = assessEligibility(candidate(WITH_GAP), 'EQUITY_DOMESTIC', CONFIG, AS_OF);
    expect(r.reasons).not.toContain('nav_history_gap');
  });

  it('leaves plain reasons as plain strings in the persisted form', () => {
    const regular = { ...candidate(WITH_GAP), planType: 'Regular Plan' };
    const r = assessEligibility(regular, 'EQUITY_DOMESTIC', CONFIG, AS_OF, CALENDAR);
    expect(r.detailedReasons).toContain('regular_plan');
    expect(r.detailedReasons.filter((d) => typeof d !== 'string')).toHaveLength(1);
  });

  it('never lists nav_history_gap twice in the persisted form', () => {
    const r = assessEligibility(candidate(WITH_GAP), 'EQUITY_DOMESTIC', CONFIG, AS_OF, CALENDAR);
    const tokens = r.detailedReasons.map((d) => (typeof d === 'string' ? d : d.reason));
    expect(tokens.filter((t) => t === 'nav_history_gap')).toHaveLength(1);
  });
});

describe('readTraits', () => {
  it('carries the gap onto the traits', () => {
    const traits = readTraits(candidate(WITH_GAP), AS_OF, CALENDAR);
    expect(traits.navGap!.tradingDaysMissing).toBe(20);
  });
});
