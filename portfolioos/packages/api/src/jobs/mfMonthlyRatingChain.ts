/**
 * The monthly rating run, as one ordered chain for the month that ended.
 *
 * Ratings need a month-end `asOf` (see mfAsOfGuard: a mid-month window is one
 * monthly return short, nulls the PERFORMANCE pillar and rates nothing). The
 * score cron used to fire on the 15th with `asOf` = the 15th, scoring against
 * the nightly metrics and peer ranks — which are also computed for "today".
 * Every scheduled run would have produced zero ratings.
 *
 * So on the 15th — late enough for the month's NAVs, factsheets and
 * NAV adjustments to have landed — this computes metrics, then peer ranks,
 * then scores, all for the previous month-end, each step after the last has
 * finished. The nightly metrics / peer-rank runs at "today" are untouched.
 */
import { logger } from '../lib/logger.js';
import { runMfMetricsJob } from './mfMetricsJob.js';
import { runMfPeerRankJob } from './mfPeerRankJob.js';
import { runMfScoreJob } from './mfScoreJob.js';

/** Last calendar day of the month before `now`, at 00:00 UTC. */
export function previousMonthEnd(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
}

export async function runMonthlyRatingChain(now: Date = new Date()): Promise<void> {
  const asOf = previousMonthEnd(now);
  const iso = asOf.toISOString().slice(0, 10);
  logger.info({ asOf: iso }, '[mf] monthly rating chain: start');
  await runMfMetricsJob({ asOf });
  const ranks = await runMfPeerRankJob(asOf);
  if (!ranks || ranks.universes === 0) {
    // runMfPeerRankJob returns an all-zero result when another run holds its
    // lock. Scoring now would rate against last month's ranks, or none.
    logger.error({ asOf: iso }, '[mf] monthly rating chain: peer ranks did not run — not scoring');
    return;
  }
  await runMfScoreJob(asOf);
  logger.info({ asOf: iso }, '[mf] monthly rating chain: done');
}
