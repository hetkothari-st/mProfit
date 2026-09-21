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
  methodology: vi.fn(),
  findFirst: vi.fn(),
  env: { RIA_VERDICTS_ENABLED: 'true' },
}));
vi.mock('../../../../src/priceFeeds/amfiCostAndSize.service.js', () => ({
  fundDataCoverage: gateMocks.coverage,
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

const CONFIG = { coverage: { minTerCoveragePct: 95, minAumCoveragePct: 95 } };

beforeEach(() => {
  vi.clearAllMocks();
  gateMocks.env.RIA_VERDICTS_ENABLED = 'true';
  gateMocks.coverage.mockResolvedValue({
    eligibleSchemes: 1800,
    terCoveragePct: 97,
    aumCoveragePct: 96,
  });
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
    gateMocks.coverage.mockResolvedValue({
      eligibleSchemes: 1800,
      terCoveragePct: 61,
      aumCoveragePct: 96,
    });
    const r = await evaluateNamedFundReleaseGate();
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/TER coverage is 61%/);
    await expect(assertNamedFundReleaseGate()).rejects.toThrow(/release gate failed/i);
  });

  it('fails on thin AUM coverage', async () => {
    gateMocks.coverage.mockResolvedValue({
      eligibleSchemes: 1800,
      terCoveragePct: 99,
      aumCoveragePct: 40,
    });
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

  // With the feature off the figures are still logged, but a thin dataset is
  // not a reason to refuse to boot.
  it('does not block boot when named-fund advice is switched off', async () => {
    gateMocks.env.RIA_VERDICTS_ENABLED = 'false';
    gateMocks.coverage.mockResolvedValue({
      eligibleSchemes: 1800,
      terCoveragePct: 3,
      aumCoveragePct: 1,
    });
    await expect(assertNamedFundReleaseGate()).resolves.toMatchObject({ ok: false });
  });
});
