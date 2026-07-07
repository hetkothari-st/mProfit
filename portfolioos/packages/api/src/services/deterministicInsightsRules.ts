/**
 * Pure, DB-free rules for the deterministic (non-LLM) insight generators in
 * `deterministicInsights.ts`. Kept separate and side-effect-free so they can
 * be unit-tested with plain Date fixtures (mirrors the `*Math.ts` convention
 * used by taxHarvestMath.ts / healthScoreMath.ts elsewhere in this package).
 */

const FD_MATURITY_WINDOW_DAYS = 30;

export interface FdMaturityWindow {
  daysUntil: number;
}

/**
 * An FD maturity is worth surfacing once it's within the next 30 days.
 * Already-matured (negative daysUntil) FDs fall outside the window — unlike
 * the vehicle-document-expiry checks in dashboard.service.ts, an overdue FD
 * maturity isn't an actionable reminder (the deposit has already matured;
 * the projection/withdrawal transaction is what should exist next, not a
 * repeated nag).
 */
export function classifyFdMaturity(maturityDate: Date, now: Date): FdMaturityWindow | null {
  const daysUntil = Math.ceil((maturityDate.getTime() - now.getTime()) / 86_400_000);
  if (daysUntil < 0 || daysUntil > FD_MATURITY_WINDOW_DAYS) return null;
  return { daysUntil };
}

/**
 * Tax-loss harvesting is only meaningful in the run-up to the FY close
 * (31 March). Gate the card to roughly Oct 1 – Mar 31 so it doesn't show
 * up (and go stale/irrelevant) for the other half of the year.
 */
export function isTaxLossHarvestWindow(now: Date): boolean {
  const month = now.getUTCMonth(); // 0-indexed: Oct=9, Nov=10, Dec=11, Jan=0, Feb=1, Mar=2
  return month >= 9 || month <= 2;
}
