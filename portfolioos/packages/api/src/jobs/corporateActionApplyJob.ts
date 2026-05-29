import { prisma } from '../lib/prisma.js';
import { applyCorporateActionsForPortfolio } from '../services/corporateActionApply.service.js';

/**
 * Sweep every portfolio and fold any newly-fetched corporate actions (splits,
 * bonuses) into holdings as idempotent transactions. Runs right after the
 * daily corporate-action fetch. Re-runs are safe — already-applied actions are
 * skipped via their deterministic sourceHash.
 */
export async function runCorporateActionApplyAll(): Promise<{ portfolios: number; applied: number }> {
  const portfolios = await prisma.portfolio.findMany({ select: { id: true } });
  let applied = 0;
  for (const p of portfolios) {
    applied += await applyCorporateActionsForPortfolio(p.id);
  }
  return { portfolios: portfolios.length, applied };
}
