/**
 * How much a candidate duplicates what the client already owns.
 *
 * The honest version of this compares portfolio holdings between two schemes —
 * `services/mfOverlap.service.ts` does exactly that for funds whose holdings we
 * have. We do not have constituent holdings for the market at large, only for
 * schemes the client already owns through their statements, so a true overlap
 * matrix across every candidate is not available today.
 *
 * Rather than invent one, this returns the only overlap we can state without
 * guessing: a fund the client already holds overlaps itself completely. Every
 * other candidate returns `null`, which selection treats as UNKNOWN and not as
 * zero — the distinction matters, because "no overlap" would let a near-clone
 * of an existing holding through unpenalised.
 *
 * When constituent data for the wider universe exists, this is the one
 * function to change; `selection.ts` already consumes the percentage.
 *
 * Pure: no DB, no clock.
 */

/** 100 when the client already holds this exact scheme, else unknown. */
export function schemeOverlapPct(fundId: string | null, heldFundIds: Set<string>): number | null {
  if (!fundId) return null;
  return heldFundIds.has(fundId) ? 100 : null;
}
