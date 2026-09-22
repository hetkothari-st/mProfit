import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Decimal } from 'decimal.js';
import { switchIsWorthIt } from '../../../../src/services/advisor/fundRanking/selection.js';

/**
 * Two safeguards that exist because of what we still do NOT know: the exit
 * load on a fund, and how much of the market we hold cost and size for.
 */

describe('exit-load suppression', () => {
  const base = {
    holdingValue: new Decimal(500_000),
    unrealisedGain: new Decimal(1_000),
    capitalGainsRatePct: 12.5,
    exitLoadPct: null,
    // Large enough that the switch would otherwise clearly pay for itself.
    expectedAnnualAdvantagePct: 3,
    materialityTolerance: 0.1,
  };

  // Most equity funds charge ~1% on units redeemed inside a year, and we hold
  // no schedules. Quoting a switch cost without it understates the cost by its
  // largest component, and the client pays the difference.
  it('suppresses a switch out of a lot held under a year', () => {
    const r = switchIsWorthIt({ ...base, holdingDays: 200 });
    expect(r.worthIt).toBe(false);
    expect(r.suppressedReason).toBe('exit load unknown, lot within 12 months');
  });

  it('suppresses when the holding period is unknown — unknown is not "old"', () => {
    const r = switchIsWorthIt({ ...base, holdingDays: null });
    expect(r.worthIt).toBe(false);
    expect(r.suppressedReason).toBe('exit load unknown, lot within 12 months');
  });

  it('allows a switch out of an older lot, still flagging the gap', () => {
    const r = switchIsWorthIt({ ...base, holdingDays: 500 });
    expect(r.worthIt).toBe(true);
    expect(r.suppressedReason).toBeNull();
    // The load is still unknown; the flag travels with the recommendation.
    expect(r.exitLoadAssumedZero).toBe(true);
  });

  it('does not suppress when a real exit load is known', () => {
    const r = switchIsWorthIt({ ...base, exitLoadPct: 0, holdingDays: 30 });
    expect(r.suppressedReason).toBeNull();
    expect(r.exitLoadAssumedZero).toBe(false);
  });

  it('respects a configured window other than a year', () => {
    const r = switchIsWorthIt({ ...base, holdingDays: 200, minHoldingDaysForSwitch: 90 });
    expect(r.worthIt).toBe(true);
  });

  // Suppression is a veto, not a substitute for the economics.
  it('still refuses a switch that cannot pay for its tax, however old the lot', () => {
    const r = switchIsWorthIt({
      ...base,
      unrealisedGain: new Decimal(400_000),
      expectedAnnualAdvantagePct: 0.2,
      holdingDays: 2_000,
    });
    expect(r.worthIt).toBe(false);
    expect(r.suppressedReason).toBeNull();
  });
});

const gateMocks = vi.hoisted(() => ({
  coverage: vi.fn(),
  modelPortfolios: vi.fn(),
  methodology: vi.fn(),
  findFirst: vi.fn(),
  env: { RIA_VERDICTS_ENABLED: 'true' },
}));
vi.mock('../../../../src/services/advisor/fundRanking/coverage.js', () => ({
  fundDataCoverage: gateMocks.coverage,
  // The gate reads this too now: a model portfolio that allocates to nothing
  // is its own problem, separate from a bucket that is merely thin.
  modelPortfolioBuckets: gateMocks.modelPortfolios,
}));
vi.mock('../../../../src/services/advisor/fundRanking/methodology.service.js', () => ({
  currentMethodology: gateMocks.methodology,
}));
vi.mock('../../../../src/lib/prisma.js', () => ({
  prisma: { rankingMethodologyVersion: { findFirst: gateMocks.findFirst } },
}));
vi.mock('../../../../src/config/env.js', () => ({ env: gateMocks.env }));

const { assertNamedFundReleaseGate, evaluateNamedFundReleaseGate } = await import(
  '../../../../src/services/advisor/fundRanking/releaseGate.js'
);

const CONFIG = {
  coverage: { minTerCoveragePct: 95, minAumCoveragePct: 95, minCandidatesPerBucket: 5 },
};

/** A bucket list where every bucket a portfolio uses is comfortably deep. */
const HEALTHY_BUCKETS = [
  { bucket: 'EQUITY_DOMESTIC', eligible: 420, used: true },
  { bucket: 'DEBT', eligible: 260, used: true },
  { bucket: 'GOLD', eligible: 11, used: true },
  // Nothing allocates to this one, so its depth is not the gate's business.
  { bucket: 'EQUITY_INTERNATIONAL', eligible: 1, used: false },
];

/** Four production-shaped portfolios, each allocating to real buckets. */
const HEALTHY_MODEL_PORTFOLIOS = [
  {
    id: 'mp1',
    name: 'Aggressive',
    riskCategory: 'AGGRESSIVE',
    weights: [
      { bucket: 'EQUITY_DOMESTIC', targetPct: 72 },
      { bucket: 'DEBT', targetPct: 12 },
      { bucket: 'GOLD', targetPct: 3 },
    ],
  },
];

const coverageResult = (over: Record<string, unknown> = {}) => ({
  eligibleSchemes: 1800,
  terCoveragePct: 97,
  aumEligibleSchemes: 1790,
  aumCoveragePct: 96,
  missingAum: [],
  buckets: HEALTHY_BUCKETS,
  modelPortfolios: HEALTHY_MODEL_PORTFOLIOS,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  gateMocks.env.RIA_VERDICTS_ENABLED = 'true';
  gateMocks.coverage.mockResolvedValue(coverageResult());
  gateMocks.modelPortfolios.mockResolvedValue(HEALTHY_MODEL_PORTFOLIOS);
  gateMocks.methodology.mockResolvedValue({ id: 'm2', version: 2, config: CONFIG });
  gateMocks.findFirst.mockResolvedValue({ version: 2 });
});

describe('named-fund release gate', () => {
  it('passes when coverage clears the threshold and the newest methodology is signed', async () => {
    const r = await evaluateNamedFundReleaseGate();
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    await expect(assertNamedFundReleaseGate()).resolves.toMatchObject({ ok: true });
  });

  // The failure this prevents: a cost-weighted ranking deciding on whichever
  // funds happen to have a TER, which is not a random sample.
  it('fails on thin TER coverage, and says what to do about it', async () => {
    gateMocks.coverage.mockResolvedValue(coverageResult({ terCoveragePct: 61 }));
    const r = await evaluateNamedFundReleaseGate();
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/TER coverage is 61%/);
    await expect(assertNamedFundReleaseGate()).rejects.toThrow(/release gate failed/i);
  });

  it('fails on thin AUM coverage', async () => {
    gateMocks.coverage.mockResolvedValue(
      coverageResult({ terCoveragePct: 99, aumCoveragePct: 40 }),
    );
    const r = await evaluateNamedFundReleaseGate();
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/AUM coverage is 40%/);
  });

  // Advising under a superseded method while a newer one waits unsigned is
  // the drift the whole versioning scheme exists to prevent.
  it('fails when a newer methodology exists than the one in use', async () => {
    gateMocks.methodology.mockResolvedValue({ id: 'm1', version: 1, config: CONFIG });
    gateMocks.findFirst.mockResolvedValue({ version: 2 });
    const r = await evaluateNamedFundReleaseGate();
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/v1 is in use but v2 exists/);
  });

  it('fails when nothing is signed at all', async () => {
    gateMocks.methodology.mockResolvedValue(null);
    const r = await evaluateNamedFundReleaseGate();
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/No signed-off ranking methodology/);
  });

  // Depth, not just coverage. 100% TER coverage across three schemes is a
  // bucket where the "ranking" names the only fund that qualifies.
  it('fails when a bucket a model portfolio uses has too few eligible candidates', async () => {
    gateMocks.coverage.mockResolvedValue(
      coverageResult({
        buckets: [
          { bucket: 'EQUITY_DOMESTIC', eligible: 420, used: true },
          { bucket: 'GOLD', eligible: 2, used: true },
        ],
      }),
    );
    const r = await evaluateNamedFundReleaseGate();
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/Bucket GOLD has 2 eligible schemes, below the 5 required/);
    await expect(assertNamedFundReleaseGate()).rejects.toThrow(/release gate failed/i);
  });

  it('ignores a thin bucket no model portfolio allocates to', async () => {
    gateMocks.coverage.mockResolvedValue(
      coverageResult({
        buckets: [
          { bucket: 'EQUITY_DOMESTIC', eligible: 420, used: true },
          { bucket: 'OTHER_ALT', eligible: 0, used: false },
        ],
      }),
    );
    const r = await evaluateNamedFundReleaseGate();
    expect(r.ok).toBe(true);
  });

  it('uses the methodology minimum over the default when one is configured', async () => {
    gateMocks.methodology.mockResolvedValue({
      id: 'm2',
      version: 2,
      config: { coverage: { ...CONFIG.coverage, minCandidatesPerBucket: 12 } },
    });
    gateMocks.coverage.mockResolvedValue(
      coverageResult({ buckets: [{ bucket: 'GOLD', eligible: 11, used: true }] }),
    );
    const r = await evaluateNamedFundReleaseGate();
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/below the 12 required/);
  });

  // The singular, because "has 1 eligible schemes" reads as a bug.
  it('says "scheme" when a bucket has exactly one', async () => {
    gateMocks.coverage.mockResolvedValue(
      coverageResult({ buckets: [{ bucket: 'GOLD', eligible: 1, used: true }] }),
    );
    const r = await evaluateNamedFundReleaseGate();
    expect(r.problems.join(' ')).toMatch(/has 1 eligible scheme,/);
  });

  // With nothing signed there is no methodology to read eligibility rules
  // from, so coverage is not measured — and must not be reported as 0%,
  // which would read as a data problem rather than a missing signature.
  it('does not add a coverage complaint when nothing is signed', async () => {
    gateMocks.methodology.mockResolvedValue(null);
    const r = await evaluateNamedFundReleaseGate();
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/No signed-off ranking methodology/);
    expect(gateMocks.coverage).not.toHaveBeenCalled();
  });

  // With the feature off the figures are still logged, but a thin dataset is
  // not a reason to refuse to boot.
  it('does not block boot when named-fund advice is switched off', async () => {
    gateMocks.env.RIA_VERDICTS_ENABLED = 'false';
    gateMocks.coverage.mockResolvedValue(
      coverageResult({ terCoveragePct: 3, aumCoveragePct: 1 }),
    );
    await expect(assertNamedFundReleaseGate()).resolves.toMatchObject({ ok: false });
  });
});
