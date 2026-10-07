import { Decimal } from 'decimal.js';

/**
 * Pure XIRR solver.
 *
 * This lives in `shared` rather than in the API's `xirr.service.ts` because
 * two consumers need it without a database: `mfMetricsMath.ts` (which is
 * required to be pure — no I/O, no Prisma — so its outputs are reproducible
 * from fixtures alone) and the frontend, for the hypothetical-SIP figure.
 * `xirr.service.ts` keeps the Prisma-backed cashflow assembly and re-exports
 * this solver, so there is exactly one implementation and the numbers on the
 * dashboard and in a metrics row cannot diverge.
 *
 * **Why the solver itself uses JS numbers.** Rate search is transcendental:
 * every iteration evaluates `(1 + r)^t` for fractional `t`, which has no exact
 * decimal representation at any precision. Decimal.js would give us a slower
 * loop with the same convergence-bounded error. The discipline that matters is
 * at the edges — cashflow *amounts* arrive as Decimal and are cast once, and
 * the result is a dimensionless rate, not money. Nothing here is ever summed
 * into a balance.
 */

export interface XirrFlow {
  date: Date;
  /** Negative = money out (buy/contribution), positive = money in (sell/terminal). */
  amount: Decimal;
}

/** Newton tolerance. Tighter than the 1e-7 the API service used; see `02 §2.4`. */
const NEWTON_TOLERANCE = 1e-8;
const NEWTON_MAX_ITERATIONS = 100;
const BISECTION_MAX_ITERATIONS = 200;
const RATE_FLOOR = -0.9999;
const RATE_CEILING = 10;

function yearFraction(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (365.0 * 24 * 60 * 60 * 1000);
}

function npv(rate: number, flows: XirrFlow[], t0: Date): number {
  let total = 0;
  for (const cf of flows) {
    total += cf.amount.toNumber() / Math.pow(1 + rate, yearFraction(t0, cf.date));
  }
  return total;
}

function npvDerivative(rate: number, flows: XirrFlow[], t0: Date): number {
  let total = 0;
  for (const cf of flows) {
    const t = yearFraction(t0, cf.date);
    total -= (t * cf.amount.toNumber()) / Math.pow(1 + rate, t + 1);
  }
  return total;
}

/**
 * Newton-Raphson with a bisection fallback. Returns the annualised rate as a
 * plain fraction (0.12 = 12%), or `null` when the inputs are degenerate or the
 * solver does not converge.
 *
 * `null` rather than a wild number is deliberate: an XIRR that failed to
 * converge and one that legitimately came out at 340% are indistinguishable to
 * a caller that only sees a number, and only one of them should be displayed.
 * Callers surface it as `xirr_no_convergence` (`04 §1`).
 */
export function xirr(flows: XirrFlow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  // A rate of return is undefined without both a contribution and a return of
  // capital; solving anyway would just walk to the clamp boundary.
  const hasPos = flows.some((f) => f.amount.greaterThan(0));
  const hasNeg = flows.some((f) => f.amount.lessThan(0));
  if (!hasPos || !hasNeg) return null;

  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0]!.date;

  let rate = guess;
  for (let i = 0; i < NEWTON_MAX_ITERATIONS; i++) {
    const f = npv(rate, sorted, t0);
    const d = npvDerivative(rate, sorted, t0);
    if (!Number.isFinite(f) || !Number.isFinite(d) || d === 0) break;
    const next = rate - f / d;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < NEWTON_TOLERANCE) return next;
    rate = Math.max(RATE_FLOOR, Math.min(next, RATE_CEILING));
  }

  // Newton diverges on flow patterns with several sign changes (a portfolio
  // that was fully sold and re-entered). Bisection cannot diverge, only fail
  // to bracket, so it is the right fallback rather than a second guess.
  let low = -0.99;
  let high = RATE_CEILING;
  let fLow = npv(low, sorted, t0);
  const fHigh = npv(high, sorted, t0);
  if (Number.isFinite(fLow) && Number.isFinite(fHigh) && fLow * fHigh < 0) {
    for (let i = 0; i < BISECTION_MAX_ITERATIONS; i++) {
      const mid = (low + high) / 2;
      const fMid = npv(mid, sorted, t0);
      if (!Number.isFinite(fMid)) break;
      if (Math.abs(fMid) < 1e-6) return mid;
      if (fMid * fLow < 0) {
        high = mid;
      } else {
        low = mid;
        fLow = fMid;
      }
    }
    return (low + high) / 2;
  }
  return null;
}

/**
 * XIRR of a hypothetical monthly SIP (`02 §2.4`): a fixed instalment on the
 * first available NAV date of each month, redeemed at the terminal NAV.
 *
 * Takes NAVs rather than cashflows because the point of the figure is to be
 * comparable across funds — the instalment is the same everywhere and only the
 * NAV path differs.
 */
export function sipXirr(
  monthlyNavDates: Array<{ date: Date; nav: Decimal }>,
  instalment: Decimal,
  terminal: { date: Date; nav: Decimal },
): number | null {
  if (monthlyNavDates.length < 2) return null;

  const flows: XirrFlow[] = [];
  let units = new Decimal(0);
  for (const point of monthlyNavDates) {
    if (point.nav.lessThanOrEqualTo(0)) continue;
    units = units.plus(instalment.dividedBy(point.nav));
    flows.push({ date: point.date, amount: instalment.negated() });
  }
  if (flows.length < 2 || units.isZero()) return null;

  flows.push({ date: terminal.date, amount: units.times(terminal.nav) });
  return xirr(flows);
}
