/**
 * Black-Scholes pricing + Greeks + Newton-Raphson implied-volatility solver
 * for European-style options. Pure functions — callable on both server and
 * client. Inputs/outputs use `number`, but every consumer stringifies via
 * decimal.js before persisting (§3.2). The math here is intermediate and
 * IEEE-754 is acceptable; never do money arithmetic with these results
 * downstream.
 *
 * Indian F&O caveats handled here:
 *   - Indian risk-free rate default = 0.07 (10y G-Sec ~7%); overridable.
 *   - Dividend yield default = 0 (no DivYield for index options; equity
 *     options post-Sep-2018 are physical-settled but the dividend impact on
 *     short-dated options is usually ignored in practice — overridable).
 *   - Stock options after Oct-2019 are American-style on physical-settled
 *     names; B-S over-prices early exercise for deep-ITM puts. Acceptable
 *     approximation for display; binomial-tree upgrade deferred.
 */

export interface OptionInputs {
  spot: number;          // S — underlying price
  strike: number;        // K — strike
  timeToExpiryYears: number; // T — annualised, e.g. 30 days = 30/365
  riskFreeRate: number;  // r — annual continuous, e.g. 0.07
  volatility: number;    // σ — annual continuous, e.g. 0.20
  dividendYield?: number; // q — annual continuous, default 0
  isCall: boolean;
}

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number; // per-day (already divided by 365)
  vega: number;  // per-1%-vol shift
  rho: number;   // per-1%-rate shift
}

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** Standard normal PDF. */
function pdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/**
 * Standard normal CDF — Abramowitz-Stegun 26.2.17. Max error ≈ 1e-7,
 * good enough for Greeks display. Pure JS, no `Math.erf` (browser parity).
 */
export function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * ax);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

function d1(i: OptionInputs): number {
  const q = i.dividendYield ?? 0;
  return (
    (Math.log(i.spot / i.strike) +
      (i.riskFreeRate - q + 0.5 * i.volatility * i.volatility) *
        i.timeToExpiryYears) /
    (i.volatility * Math.sqrt(i.timeToExpiryYears))
  );
}

function d2(i: OptionInputs, d1v: number): number {
  return d1v - i.volatility * Math.sqrt(i.timeToExpiryYears);
}

export function blackScholes(i: OptionInputs): Greeks {
  // Degenerate cases — prevents NaN cascades that crash the UI.
  if (i.timeToExpiryYears <= 0 || i.volatility <= 0 || i.spot <= 0 || i.strike <= 0) {
    const intrinsic = Math.max(0, i.isCall ? i.spot - i.strike : i.strike - i.spot);
    return { price: intrinsic, delta: i.isCall ? (intrinsic > 0 ? 1 : 0) : (intrinsic > 0 ? -1 : 0), gamma: 0, theta: 0, vega: 0, rho: 0 };
  }

  const q = i.dividendYield ?? 0;
  const T = i.timeToExpiryYears;
  const sqrtT = Math.sqrt(T);
  const D1 = d1(i);
  const D2 = d2(i, D1);
  const Nd1 = normCdf(D1);
  const Nd2 = normCdf(D2);
  const nD1 = pdf(D1);
  const eqT = Math.exp(-q * T);
  const erT = Math.exp(-i.riskFreeRate * T);

  const price = i.isCall
    ? i.spot * eqT * Nd1 - i.strike * erT * Nd2
    : i.strike * erT * normCdf(-D2) - i.spot * eqT * normCdf(-D1);

  const delta = i.isCall ? eqT * Nd1 : eqT * (Nd1 - 1);
  const gamma = (eqT * nD1) / (i.spot * i.volatility * sqrtT);
  const vegaPerUnit = i.spot * eqT * nD1 * sqrtT; // per 1.0 vol shift
  const vega = vegaPerUnit / 100; // per 1% shift

  // Theta (annual) → per day.
  const thetaAnnual = i.isCall
    ? -((i.spot * nD1 * eqT * i.volatility) / (2 * sqrtT)) -
      i.riskFreeRate * i.strike * erT * Nd2 +
      q * i.spot * eqT * Nd1
    : -((i.spot * nD1 * eqT * i.volatility) / (2 * sqrtT)) +
      i.riskFreeRate * i.strike * erT * normCdf(-D2) -
      q * i.spot * eqT * normCdf(-D1);
  const theta = thetaAnnual / 365;

  const rhoAnnual = i.isCall
    ? i.strike * T * erT * Nd2
    : -i.strike * T * erT * normCdf(-D2);
  const rho = rhoAnnual / 100;

  return { price, delta, gamma, theta, vega, rho };
}

/**
 * Newton-Raphson IV solver. Given an observed market premium, returns the σ
 * that prices the option to within `tolerance`. Returns null when the solver
 * fails to converge (deep ITM/OTM + thin liquidity often produce premiums
 * outside the no-arbitrage band — caller should display "—" instead).
 */
export interface IvInputs {
  marketPrice: number;
  spot: number;
  strike: number;
  timeToExpiryYears: number;
  riskFreeRate: number;
  dividendYield?: number;
  isCall: boolean;
  initialGuess?: number;
  maxIterations?: number;
  tolerance?: number;
}

export function impliedVolatility(i: IvInputs): number | null {
  if (i.marketPrice <= 0 || i.timeToExpiryYears <= 0) return null;

  const intrinsic = Math.max(0, i.isCall ? i.spot - i.strike : i.strike - i.spot);
  if (i.marketPrice < intrinsic - 1e-6) return null; // arbitrage violation

  let sigma = i.initialGuess ?? 0.2;
  const tol = i.tolerance ?? 1e-5;
  const maxIter = i.maxIterations ?? 100;

  for (let n = 0; n < maxIter; n += 1) {
    const greeks = blackScholes({
      spot: i.spot,
      strike: i.strike,
      timeToExpiryYears: i.timeToExpiryYears,
      riskFreeRate: i.riskFreeRate,
      dividendYield: i.dividendYield ?? 0,
      volatility: sigma,
      isCall: i.isCall,
    });
    const diff = greeks.price - i.marketPrice;
    if (Math.abs(diff) < tol) return sigma;
    // vega is per-1%; multiply by 100 to get per-unit-vol derivative.
    const vegaPerUnit = greeks.vega * 100;
    if (vegaPerUnit < 1e-10) return null; // vega too small → can't converge
    sigma = sigma - diff / vegaPerUnit;
    if (sigma <= 0 || !Number.isFinite(sigma)) return null;
  }
  return null;
}

/**
 * Year-fraction between trade date and expiry under ACT/365. Inputs may be
 * Date objects or ISO strings; outputs in years (e.g. 30 days → 0.0822).
 */
export function timeToExpiryYears(now: Date | string, expiry: Date | string): number {
  const a = typeof now === 'string' ? new Date(now) : now;
  const b = typeof expiry === 'string' ? new Date(expiry) : expiry;
  return Math.max(0, (b.getTime() - a.getTime()) / (365 * 24 * 60 * 60 * 1000));
}

/**
 * Indian-market default risk-free rate. 10y G-Sec yield is the conventional
 * proxy. Update via `AppSetting fno.risk_free_rate` if needed.
 */
export const DEFAULT_INDIAN_RISK_FREE_RATE = 0.07;
