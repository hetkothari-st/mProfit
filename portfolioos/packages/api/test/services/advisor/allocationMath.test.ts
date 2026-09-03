import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  computeDrift,
  sizeRebalanceTrade,
  unitsFor,
  type DriftRow,
} from '../../../src/services/advisor/allocationMath.js';
import {
  MAX_SINGLE_TRADE_PCT,
  MIN_TRADE_INR,
  REBALANCE_BAND_PP,
} from '../../../src/services/advisor/constants.js';
import type {
  AdvisorAllocationFact,
  AdvisorAssetBucketValue,
  AdvisorTargetFact,
} from '../../../src/services/advisor/types.js';

const D = (n: number | string) => new Decimal(n);

const TOTAL = D(1_000_000);

const CURRENT: AdvisorAllocationFact[] = [
  { bucket: 'EQUITY_DOMESTIC', currentPct: 70, currentValue: D(700_000) },
  { bucket: 'DEBT', currentPct: 20, currentValue: D(200_000) },
  { bucket: 'CASH_EQUIVALENT', currentPct: 10, currentValue: D(100_000) },
];

// The BALANCED column of DEFAULT_TARGET_WEIGHTS, written out so the test does
// not silently change meaning if the defaults are recalibrated.
const TARGETS: AdvisorTargetFact[] = [
  { bucket: 'EQUITY_DOMESTIC', targetPct: 40 },
  { bucket: 'EQUITY_INTERNATIONAL', targetPct: 5 },
  { bucket: 'DEBT', targetPct: 37 },
  { bucket: 'GOLD', targetPct: 8 },
  { bucket: 'REAL_ASSETS', targetPct: 0 },
  { bucket: 'CASH_EQUIVALENT', targetPct: 10 },
  { bucket: 'OTHER_ALT', targetPct: 0 },
];

function rowFor(rows: DriftRow[], bucket: AdvisorAssetBucketValue): DriftRow {
  const row = rows.find((r) => r.bucket === bucket);
  if (!row) throw new Error(`no drift row for ${bucket}`);
  return row;
}

describe('computeDrift', () => {
  it('emits one row per bucket appearing in either list', () => {
    const rows = computeDrift(CURRENT, TARGETS, TOTAL);
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r.bucket)).size).toBe(7);
  });

  it('includes a bucket held at 0% but targeted at a real weight (the drift that matters most)', () => {
    const rows = computeDrift(
      [{ bucket: 'EQUITY_DOMESTIC', currentPct: 100, currentValue: D(1_000_000) }],
      [
        { bucket: 'EQUITY_DOMESTIC', targetPct: 60 },
        { bucket: 'DEBT', targetPct: 40 },
      ],
      TOTAL,
    );
    const debt = rowFor(rows, 'DEBT');
    expect(debt.currentPct).toBe(0);
    expect(debt.targetPct).toBe(40);
    expect(debt.driftPp).toBe(-40);
    expect(debt.driftValue.toNumber()).toBe(-400_000);
  });

  it('includes a bucket held but not targeted at all', () => {
    const rows = computeDrift(
      [
        { bucket: 'EQUITY_DOMESTIC', currentPct: 88, currentValue: D(880_000) },
        { bucket: 'OTHER_ALT', currentPct: 12, currentValue: D(120_000) },
      ],
      [{ bucket: 'EQUITY_DOMESTIC', targetPct: 100 }],
      TOTAL,
    );
    const alt = rowFor(rows, 'OTHER_ALT');
    expect(alt.targetPct).toBe(0);
    expect(alt.driftPp).toBe(12);
    expect(alt.driftValue.toNumber()).toBe(120_000);
  });

  it('signs drift so positive means overweight', () => {
    const rows = computeDrift(CURRENT, TARGETS, TOTAL);
    const equity = rowFor(rows, 'EQUITY_DOMESTIC');
    expect(equity.driftPp).toBe(30);
    expect(equity.driftValue.toNumber()).toBe(300_000);

    const debt = rowFor(rows, 'DEBT');
    expect(debt.driftPp).toBe(-17);
    expect(debt.driftValue.toNumber()).toBe(-170_000);
  });

  it('reports a perfectly on-target bucket as zero drift rather than dropping it', () => {
    const cash = rowFor(computeDrift(CURRENT, TARGETS, TOTAL), 'CASH_EQUIVALENT');
    expect(cash.driftPp).toBe(0);
    expect(cash.driftValue.toNumber()).toBe(0);
  });

  it('orders by absolute drift, largest first', () => {
    const rows = computeDrift(CURRENT, TARGETS, TOTAL);
    expect(rows.slice(0, 4).map((r) => r.bucket)).toEqual([
      'EQUITY_DOMESTIC',
      'DEBT',
      'GOLD',
      'EQUITY_INTERNATIONAL',
    ]);
  });

  it('sums duplicate current rows for one bucket (a bucket split across portfolios)', () => {
    const rows = computeDrift(
      [
        { bucket: 'DEBT', currentPct: 12, currentValue: D(120_000) },
        { bucket: 'DEBT', currentPct: 8, currentValue: D(80_000) },
      ],
      [{ bucket: 'DEBT', targetPct: 100 }],
      TOTAL,
    );
    const debt = rowFor(rows, 'DEBT');
    expect(debt.currentPct).toBe(20);
    expect(debt.driftValue.toNumber()).toBe(-800_000);
  });

  it('returns an empty list when there is nothing on either side', () => {
    expect(computeDrift([], [], TOTAL)).toEqual([]);
  });
});

describe('sizeRebalanceTrade', () => {
  const rows = computeDrift(CURRENT, TARGETS, TOTAL);

  it('sells an overweight bucket and buys an underweight one', () => {
    const sell = sizeRebalanceTrade(rowFor(rows, 'EQUITY_DOMESTIC'), TOTAL);
    expect(sell?.direction).toBe('SELL');

    const buy = sizeRebalanceTrade(rowFor(rows, 'DEBT'), TOTAL);
    expect(buy?.direction).toBe('BUY');
    expect(buy?.amountInr.toNumber()).toBe(170_000);
  });

  it(`caps a single instruction at ${MAX_SINGLE_TRADE_PCT * 100}% of the portfolio`, () => {
    const sell = sizeRebalanceTrade(rowFor(rows, 'EQUITY_DOMESTIC'), TOTAL);
    // Raw drift is ₹300,000; the cap pulls it back to ₹250,000.
    expect(sell?.amountInr.toNumber()).toBe(250_000);
  });

  it('is silent inside the rebalance band', () => {
    const inside: DriftRow = {
      bucket: 'GOLD',
      currentPct: 12,
      targetPct: 8,
      driftPp: REBALANCE_BAND_PP - 0.1,
      driftValue: D(49_000),
    };
    expect(sizeRebalanceTrade(inside, TOTAL)).toBeNull();
  });

  it('acts exactly at the band edge', () => {
    const atEdge: DriftRow = {
      bucket: 'GOLD',
      currentPct: 13,
      targetPct: 8,
      driftPp: REBALANCE_BAND_PP,
      driftValue: D(50_000),
    };
    expect(sizeRebalanceTrade(atEdge, TOTAL)?.amountInr.toNumber()).toBe(50_000);
  });

  it('is silent when the money involved is below the minimum trade size', () => {
    const tiny: DriftRow = {
      bucket: 'GOLD',
      currentPct: 10,
      targetPct: 0,
      driftPp: 10,
      driftValue: MIN_TRADE_INR.minus(1),
    };
    expect(sizeRebalanceTrade(tiny, TOTAL)).toBeNull();
  });

  it('is silent when the cap drags the amount back under the minimum trade size', () => {
    const total = D(19_000); // cap = ₹4,750, below MIN_TRADE_INR
    const row: DriftRow = {
      bucket: 'GOLD',
      currentPct: 40,
      targetPct: 8,
      driftPp: 32,
      driftValue: D(6_000),
    };
    expect(sizeRebalanceTrade(row, total)).toBeNull();
  });

  it('is silent when there is no portfolio to rebalance', () => {
    const row: DriftRow = {
      bucket: 'GOLD',
      currentPct: 40,
      targetPct: 8,
      driftPp: 32,
      driftValue: D(600_000),
    };
    expect(sizeRebalanceTrade(row, D(0))).toBeNull();
  });
});

describe('unitsFor', () => {
  it('converts an amount at a live price', () => {
    expect(unitsFor(D(10_000), D(250), false)).toBe('40');
  });

  it('NEVER produces units from a stale price', () => {
    expect(unitsFor(D(10_000), D(250), true)).toBeNull();
  });

  it('returns null when there is no price at all', () => {
    expect(unitsFor(D(10_000), null, false)).toBeNull();
  });

  it('returns null for a non-positive price', () => {
    expect(unitsFor(D(10_000), D(0), false)).toBeNull();
    expect(unitsFor(D(10_000), D(-5), false)).toBeNull();
  });

  it('returns null for a non-positive amount', () => {
    expect(unitsFor(D(0), D(250), false)).toBeNull();
    expect(unitsFor(D(-100), D(250), false)).toBeNull();
  });

  it('rounds down to 4 dp so the instruction never over-buys', () => {
    expect(unitsFor(D(10_000), D(3), false)).toBe('3333.3333');
  });

  it('returns null rather than "0" when the amount buys nothing', () => {
    expect(unitsFor(D(1), D(100_000), false)).toBeNull();
  });
});
