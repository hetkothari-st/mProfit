import { Decimal } from 'decimal.js';
import type { RateReading } from './types.js';

/** spec s5.4: a headline rate outside 4-30 % is not believable for a retail loan. */
export const MIN_BELIEVABLE_PCT = new Decimal(4);
export const MAX_BELIEVABLE_PCT = new Decimal(30);
/** Ceilings are published higher than the headline band (Kotak business loans go to 30.50 %). */
export const MAX_CEILING_PCT = new Decimal(40);
/** spec s5.4: more than 2 percentage points away from the last ACTIVE reading. */
export const MAX_JUMP_PP = new Decimal(2);
/** As-of guard: a page date this far in the future is a misparse. */
export const MAX_FUTURE_DAYS = 7;
/** As-of guard: MCLR is reset at least half-yearly; a product sheet at least yearly. */
export const MAX_ASOF_AGE_DAYS = { MCLR: 180, PRODUCT: 400 } as const;

export type SanityReason = 'OUT_OF_RANGE' | 'BAD_MAX' | 'JUMP' | 'ASOF_FUTURE' | 'ASOF_STALE' | 'BAD_DATE';

export interface SanityVerdict {
  status: 'ACTIVE' | 'SUSPECT';
  reasons: SanityReason[];
}

const DAY_MS = 86_400_000;

/** Calendar date in India for an instant, as 'YYYY-MM-DD'. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/**
 * Decide whether an AUTO reading may be shown to users. `lastActiveMinPct` is the min rate of the latest
 * ACTIVE AUTO row for the same (source, tenor), or null for the first reading. The repo rate carries no page
 * date, so the as-of guard only runs when the page gave one.
 */
export function checkReading(reading: RateReading, lastActiveMinPct: string | null, today: string): SanityVerdict {
  const reasons: SanityReason[] = [];
  const min = new Decimal(reading.minRatePct);
  if (min.lessThan(MIN_BELIEVABLE_PCT) || min.greaterThan(MAX_BELIEVABLE_PCT)) reasons.push('OUT_OF_RANGE');
  if (reading.maxRatePct !== null) {
    const max = new Decimal(reading.maxRatePct);
    if (max.lessThan(min) || max.greaterThan(MAX_CEILING_PCT)) reasons.push('BAD_MAX');
  }
  if (lastActiveMinPct !== null && min.minus(lastActiveMinPct).abs().greaterThan(MAX_JUMP_PP)) reasons.push('JUMP');
  if (reading.effectiveDate !== null && !Number.isFinite(Date.parse(`${reading.effectiveDate}T00:00:00Z`))) {
    reasons.push('BAD_DATE');
  } else if (reading.effectiveDate !== null) {
    const age = daysBetween(reading.effectiveDate, today);
    const maxAge = reading.tenor !== null ? MAX_ASOF_AGE_DAYS.MCLR : MAX_ASOF_AGE_DAYS.PRODUCT;
    if (age < -MAX_FUTURE_DAYS) reasons.push('ASOF_FUTURE');
    else if (age > maxAge) reasons.push('ASOF_STALE');
  }
  return { status: reasons.length === 0 ? 'ACTIVE' : 'SUSPECT', reasons };
}

/** spec s5.4: an AUTO source with no successful reading for this many days is shown as stale. */
export const STALE_AFTER_DAYS = 7;

/**
 * A never-successful source counts from when it was created, so a page that has been failing since the
 * first deploy goes stale after a week instead of never.
 */
export function isSourceStale(source: { mode: string; lastSuccessAt: Date | null; createdAt: Date }, now: Date): boolean {
  if (source.mode !== 'AUTO') return false;
  const since = source.lastSuccessAt ?? source.createdAt;
  return now.getTime() - since.getTime() > STALE_AFTER_DAYS * DAY_MS;
}
