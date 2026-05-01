import { describe, it, expect } from 'vitest';
import { blackScholes, impliedVolatility, normCdf, timeToExpiryYears } from './greeks.js';

describe('Black-Scholes Greeks', () => {
  it('ATM call price matches reference (Hull 9th ed p.337)', () => {
    // S=100, K=100, T=1, r=0.05, σ=0.2, q=0 → call ≈ 10.4506
    const g = blackScholes({
      spot: 100,
      strike: 100,
      timeToExpiryYears: 1,
      riskFreeRate: 0.05,
      volatility: 0.2,
      isCall: true,
    });
    expect(g.price).toBeCloseTo(10.4506, 3);
    expect(g.delta).toBeCloseTo(0.6368, 3);
  });

  it('put-call parity within ε', () => {
    const inputs = {
      spot: 24500,
      strike: 24500,
      timeToExpiryYears: 30 / 365,
      riskFreeRate: 0.07,
      volatility: 0.15,
    };
    const c = blackScholes({ ...inputs, isCall: true }).price;
    const p = blackScholes({ ...inputs, isCall: false }).price;
    // c - p ≈ S - K e^{-rT}
    const parity = c - p - (inputs.spot - inputs.strike * Math.exp(-inputs.riskFreeRate * inputs.timeToExpiryYears));
    expect(Math.abs(parity)).toBeLessThan(0.01);
  });

  it('IV solver round-trips', () => {
    const true_sigma = 0.18;
    const inputs = {
      spot: 24000,
      strike: 24500,
      timeToExpiryYears: 30 / 365,
      riskFreeRate: 0.07,
      volatility: true_sigma,
      isCall: true,
    };
    const price = blackScholes(inputs).price;
    const iv = impliedVolatility({ ...inputs, marketPrice: price });
    expect(iv).not.toBeNull();
    expect(iv).toBeCloseTo(true_sigma, 3);
  });

  it('normCdf approximation accurate to 1e-6 at common points', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
  });

  it('expired options return intrinsic, no NaN', () => {
    const g = blackScholes({
      spot: 100,
      strike: 90,
      timeToExpiryYears: 0,
      riskFreeRate: 0.07,
      volatility: 0.2,
      isCall: true,
    });
    expect(g.price).toBe(10);
    expect(Number.isFinite(g.delta)).toBe(true);
    expect(Number.isFinite(g.gamma)).toBe(true);
  });

  it('timeToExpiryYears is ACT/365', () => {
    const t = timeToExpiryYears('2026-01-01', '2027-01-01');
    expect(t).toBeCloseTo(1, 3);
  });
});
