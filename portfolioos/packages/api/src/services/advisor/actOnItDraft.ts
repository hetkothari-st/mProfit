/**
 * Small, pure helpers every rule uses to fill the Act on it part of a draft:
 * the promise, how it will be measured, and when it expires or turns urgent.
 * (docs/superpowers/specs/2026-11-06-act-on-it-design.md §6–§7.)
 */
import type { Decimal } from 'decimal.js';
import type { AdvisorAssetBucketValue, DraftMeasurement, DraftPromise } from './types.js';

const DAY_MS = 86_400_000;

/** Days before a hard deadline at which advice turns urgent (bypasses the weekly prompt cap). */
export const URGENT_WITHIN_DAYS = 7;

export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * DAY_MS);

/** 31 March (UTC midnight) closing the Indian financial year that contains `asOf`. */
export function fyEnd(asOf: Date): Date {
  const y = asOf.getUTCMonth() >= 3 ? asOf.getUTCFullYear() + 1 : asOf.getUTCFullYear();
  return new Date(Date.UTC(y, 2, 31));
}

/** The deadline itself when it is within URGENT_WITHIN_DAYS of `asOf`, else null. */
export function urgentIfWithin(deadline: Date, asOf: Date, days = URGENT_WITHIN_DAYS): Date | null {
  const left = (deadline.getTime() - asOf.getTime()) / DAY_MS;
  return left >= 0 && left <= days ? deadline : null;
}

/** Whole days from `asOf` to `deadline` (0 when past). */
export function daysUntil(deadline: Date, asOf: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - asOf.getTime()) / DAY_MS));
}

/** Rupees with 2 dp, never negative, the form promise figures and action legs use. */
export const money2 = (d: Decimal): string => d.abs().toFixed(2);

export function promise(p: Pick<DraftPromise, 'riskBand'> & Partial<DraftPromise>): DraftPromise {
  return {
    gainInr: p.gainInr ?? null,
    riskBand: p.riskBand,
    costInr: p.costInr ?? null,
    liquidity: p.liquidity ?? null,
    confidence: p.confidence ?? 'HIGH',
  };
}

export const notMeasured = (): DraftMeasurement => ({ method: 'NOT_MEASURED', horizonDays: 0, baseline: {} });

/** How much an asset bucket can swing: what "Risk" on the card means for a buy into it. */
export const BUCKET_RISK: Record<AdvisorAssetBucketValue, DraftPromise['riskBand']> = {
  CASH_EQUIVALENT: 'LOW',
  DEBT: 'LOW',
  GOLD: 'MEDIUM',
  REAL_ASSETS: 'MEDIUM',
  EQUITY_DOMESTIC: 'HIGH',
  EQUITY_INTERNATIONAL: 'HIGH',
  OTHER_ALT: 'HIGH',
};
