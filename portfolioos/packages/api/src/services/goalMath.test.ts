import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  progressPct, inflationAdjustedTarget, requiredCagr,
  isLiquidForEmergencyFund, eligibleClassesForGoal,
} from './goalMath.js';

const D = (n: number | string) => new Decimal(n);

describe('progressPct', () => {
  it('is current/target × 100', () => {
    expect(progressPct(D(500000), D(1000000))).toBeCloseTo(50, 6);
  });
  it('caps at 100', () => {
    expect(progressPct(D(2000000), D(1000000))).toBe(100);
  });
  it('is 0 when target is non-positive', () => {
    expect(progressPct(D(500000), D(0))).toBe(0);
  });
});

describe('inflationAdjustedTarget', () => {
  it('compounds target at inflation over the years', () => {
    // 10L × 1.06^10 = 17,90,847.7
    const v = inflationAdjustedTarget(D(1000000), D('0.06'), 10);
    expect(v).not.toBeNull();
    expect(v!.toNumber()).toBeCloseTo(1790847.7, 0);
  });
  it('returns null when no inflation rate given', () => {
    expect(inflationAdjustedTarget(D(1000000), null, 10)).toBeNull();
  });
  it('does not discount for past target dates (years clamped at 0)', () => {
    expect(inflationAdjustedTarget(D(1000000), D('0.06'), -3)!.toNumber()).toBeCloseTo(1000000, 6);
  });
});

describe('requiredCagr', () => {
  it('is (target/current)^(1/years) − 1', () => {
    // (2)^(1/10) − 1 = 0.071773
    expect(requiredCagr(D(2000000), D(1000000), 10)!).toBeCloseTo(0.071773, 5);
  });
  it('returns null when current value is zero', () => {
    expect(requiredCagr(D(2000000), D(0), 10)).toBeNull();
  });
  it('returns null when target date is not in the future', () => {
    expect(requiredCagr(D(2000000), D(1000000), 0)).toBeNull();
  });
});

describe('emergency-fund liquidity', () => {
  it('counts cash and deposits as liquid', () => {
    expect(isLiquidForEmergencyFund('CASH')).toBe(true);
    expect(isLiquidForEmergencyFund('FIXED_DEPOSIT')).toBe(true);
    expect(isLiquidForEmergencyFund('RECURRING_DEPOSIT')).toBe(true);
  });
  it('excludes volatile / illiquid classes', () => {
    expect(isLiquidForEmergencyFund('EQUITY')).toBe(false);
    expect(isLiquidForEmergencyFund('CRYPTOCURRENCY')).toBe(false);
    expect(isLiquidForEmergencyFund('REAL_ESTATE')).toBe(false);
    expect(isLiquidForEmergencyFund('PHYSICAL_GOLD')).toBe(false);
  });
  it('restricts only EMERGENCY_FUND goals; others count everything', () => {
    expect(eligibleClassesForGoal('EMERGENCY_FUND')).toContain('FIXED_DEPOSIT');
    expect(eligibleClassesForGoal('EMERGENCY_FUND')).not.toContain('EQUITY');
    expect(eligibleClassesForGoal('RETIREMENT')).toBeNull();
    expect(eligibleClassesForGoal('CUSTOM')).toBeNull();
  });
});
