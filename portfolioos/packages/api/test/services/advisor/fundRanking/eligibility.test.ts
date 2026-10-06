import { describe, it, expect } from 'vitest';
import { assessEligibility, readTraits } from '../../../../src/services/advisor/fundRanking/eligibility.js';
import type {
  FundCandidate,
  MethodologyConfig,
} from '../../../../src/services/advisor/fundRanking/types.js';

/**
 * Eligibility is the gate that keeps a regular plan or an IDCW option out of
 * advice entirely, so every exclusion reason is pinned here. A fund that slips
 * through one of these is a commission an adviser did not disclose.
 */

const ASOF = new Date('2026-09-21T00:00:00Z');

const CONFIG: MethodologyConfig = {
  eligibility: {
    minTrackRecordYearsActive: 3,
    minTrackRecordYearsPassive: 1,
    minAumInr: 5_000_000_000,
    requireDirectPlan: true,
    requireGrowthOption: true,
    requireOpenEnded: true,
    maxNavStalenessDays: 10,
  },
  metrics: { rollingReturnYears: 3, rollingStepMonths: 1, minRollingWindows: 12, riskFreeRatePct: 6.5 },
  scoringActive: {},
  scoringPassive: {},
  selection: {
    incumbentRankBand: 5,
    hysteresisMarginPct: 5,
    hysteresisSnapshots: 3,
    maxAmcSharePct: 40,
    overlapPenaltyPerPct: 0.5,
    maxOverlapPct: 40,
  },
  snapshotMaxAgeDays: 3,
};

/** Monthly NAVs ending the day before asOf, so nothing is stale by accident. */
function navs(years: number, endIso = '2026-09-20'): Array<{ date: string; nav: number }> {
  const out: Array<{ date: string; nav: number }> = [];
  const end = new Date(`${endIso}T00:00:00Z`);
  const months = Math.round(years * 12);
  for (let i = months; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, end.getUTCDate()));
    out.push({ date: d.toISOString().slice(0, 10), nav: 100 + (months - i) });
  }
  return out;
}

function fund(over: Partial<FundCandidate> = {}): FundCandidate {
  return {
    schemeCode: '120503',
    schemeName: 'Acme Flexi Cap Fund - Direct Plan - Growth Option',
    amcName: 'Acme Mutual Fund',
    category: 'EQUITY',
    subCategory: 'Open Ended Schemes(Equity Scheme - Flexi Cap Fund)',
    isin: 'INF000A01234',
    isActive: true,
    navHistory: navs(5),
    terPct: null,
    aumInr: null,
    managerTenureYears: null,
    benchmarkTri: null,
    ...over,
  };
}

describe('readTraits', () => {
  it('reads plan, option and structure from the AMFI name and header', () => {
    const t = readTraits(fund(), ASOF);
    expect(t.plan).toBe('DIRECT');
    expect(t.option).toBe('GROWTH');
    expect(t.structure).toBe('OPEN_ENDED');
    expect(t.passive).toBe(false);
  });

  it('marks an index fund passive', () => {
    const t = readTraits(
      fund({ schemeName: 'Acme Nifty 50 Index Fund - Direct Plan - Growth', category: 'INDEX_FUND' }),
      ASOF,
    );
    expect(t.passive).toBe(true);
  });
});

describe('assessEligibility exclusions', () => {
  it('admits a direct-growth, open-ended fund with a long record', () => {
    const r = assessEligibility(fund(), 'EQUITY_DOMESTIC', CONFIG, ASOF);
    expect(r.reasons).toEqual([]);
    expect(r.eligible).toBe(true);
  });

  // Recommending a regular plan as a fee-only adviser hands the client's
  // return to a distributor. It is never a close call.
  it('rejects a regular plan', () => {
    const r = assessEligibility(
      fund({ schemeName: 'Acme Flexi Cap Fund - Regular Plan - Growth' }),
      'EQUITY_DOMESTIC',
      CONFIG,
      ASOF,
    );
    expect(r.reasons).toContain('regular_plan');
    expect(r.eligible).toBe(false);
  });

  it('rejects an IDCW option', () => {
    const r = assessEligibility(
      fund({ schemeName: 'Acme Flexi Cap Fund - Direct Plan - IDCW' }),
      'EQUITY_DOMESTIC',
      CONFIG,
      ASOF,
    );
    expect(r.reasons).toContain('not_growth_option');
  });

  // A missing attribute that eligibility depends on excludes the fund — it is
  // never admitted on an assumption.
  it('rejects a fund whose plan cannot be read', () => {
    const r = assessEligibility(
      fund({ schemeName: 'Acme Flexi Cap Fund - Growth' }),
      'EQUITY_DOMESTIC',
      CONFIG,
      ASOF,
    );
    expect(r.reasons).toContain('plan_unknown');
  });

  it('rejects a fund whose option cannot be read', () => {
    const r = assessEligibility(
      fund({ schemeName: 'Acme Flexi Cap Fund - Direct Plan' }),
      'EQUITY_DOMESTIC',
      CONFIG,
      ASOF,
    );
    expect(r.reasons).toContain('option_unknown');
  });

  it('rejects a scheme it cannot place in any bucket', () => {
    const r = assessEligibility(
      fund({ category: 'OTHER', subCategory: null, schemeName: 'Acme Mystery - Direct Plan - Growth' }),
      'EQUITY_DOMESTIC',
      CONFIG,
      ASOF,
    );
    expect(r.reasons).toContain('category_unknown');
  });

  it('rejects a scheme that belongs to a different bucket', () => {
    const r = assessEligibility(fund(), 'DEBT', CONFIG, ASOF);
    expect(r.reasons).toContain('category_not_in_bucket');
  });

  it('rejects a close-ended scheme — nobody can act on it', () => {
    const r = assessEligibility(
      fund({ subCategory: 'Close Ended Schemes(Equity Scheme - ELSS)' }),
      'EQUITY_DOMESTIC',
      CONFIG,
      ASOF,
    );
    expect(r.reasons).toContain('close_ended');
  });

  it('rejects a segregated portfolio', () => {
    const r = assessEligibility(
      fund({ schemeName: 'Acme Credit Risk Fund - Segregated Portfolio 1 - Direct Plan - Growth' }),
      'EQUITY_DOMESTIC',
      CONFIG,
      ASOF,
    );
    expect(r.reasons).toContain('segregated_portfolio');
  });

  it('rejects an NFO with no NAV history', () => {
    const r = assessEligibility(fund({ navHistory: [] }), 'EQUITY_DOMESTIC', CONFIG, ASOF);
    expect(r.reasons).toContain('nfo_or_no_history');
  });

  it('rejects an active fund under three years', () => {
    const r = assessEligibility(fund({ navHistory: navs(2) }), 'EQUITY_DOMESTIC', CONFIG, ASOF);
    expect(r.reasons).toContain('track_record_too_short');
  });

  // A tracker has no manager skill to demonstrate, so one year of evidence
  // that it tracks is enough.
  it('admits an index fund with only 18 months', () => {
    const r = assessEligibility(
      fund({
        schemeName: 'Acme Nifty 50 Index Fund - Direct Plan - Growth',
        category: 'INDEX_FUND',
        navHistory: navs(1.5),
      }),
      'EQUITY_DOMESTIC',
      CONFIG,
      ASOF,
    );
    expect(r.reasons).toEqual([]);
  });

  it('rejects a scheme whose NAV stopped updating', () => {
    const r = assessEligibility(
      fund({ navHistory: navs(5, '2026-06-01') }),
      'EQUITY_DOMESTIC',
      CONFIG,
      ASOF,
    );
    expect(r.reasons).toContain('nav_stale');
  });

  it('rejects a scheme AMFI no longer lists', () => {
    const r = assessEligibility(fund({ isActive: false }), 'EQUITY_DOMESTIC', CONFIG, ASOF);
    expect(r.reasons).toContain('inactive');
  });
});
