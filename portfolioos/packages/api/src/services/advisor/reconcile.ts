/**
 * Conflicts between suggestions are settled before anything is shown
 * (spec §6.4): two pieces of advice that pull the same money in different
 * directions would read as contradictory, which is the "wrong advice" this
 * feature must never give.
 *
 * - Idle cash: CASH_DEPLOYMENT (invest the surplus to target weights) needs a
 *   risk profile to be right; with one it wins, without one the low-risk
 *   IDLE_CASH_PARKING wins.
 * - A fund flagged as weak and also on a regular plan: the weak-fund advice
 *   wins (moving out covers the plan cost too).
 * - Tax-loss harvesting and gain booking on the same holding: harvesting wins.
 */
import type { AdvisorFacts, RecommendationDraft } from './types.js';

const holdingOf = (d: RecommendationDraft): string | null => {
  const k = (d.inputsUsed as { holdingKey?: unknown }).holdingKey;
  return typeof k === 'string' ? k : null;
};

const isinOrName = (d: RecommendationDraft): string | null => {
  const leg = d.action[0];
  return leg ? leg.isin ?? leg.instrumentName : null;
};

export function reconcileDrafts(drafts: RecommendationDraft[], facts: AdvisorFacts): RecommendationDraft[] {
  const has = (c: string) => drafts.some((d) => d.category === c);
  const drop = new Set<RecommendationDraft>();

  if (has('CASH_DEPLOYMENT') && has('IDLE_CASH_PARKING')) {
    const loser = facts.riskProfile?.assessmentId ? 'IDLE_CASH_PARKING' : 'CASH_DEPLOYMENT';
    for (const d of drafts) if (d.category === loser) drop.add(d);
  }

  const weakHoldings = new Set(drafts.filter((d) => d.category === 'FUND_UNDERPERFORMING').map(holdingOf).filter(Boolean));
  for (const d of drafts) if (d.category === 'REGULAR_TO_DIRECT' && weakHoldings.has(holdingOf(d))) drop.add(d);

  const harvested = new Set(drafts.filter((d) => d.category === 'TAX_HARVEST').map(isinOrName).filter(Boolean));
  for (const d of drafts) if (d.category === 'LTCG_BOOKING' && harvested.has(isinOrName(d))) drop.add(d);

  return drafts.filter((d) => !drop.has(d));
}
