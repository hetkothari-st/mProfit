/**
 * Nightly fund scoring.
 *
 * Runs at 22:30 IST, half an hour after the AMFI NAV sync at 22:00 (see
 * priceJobs.ts) so today's NAVs are in before anything is scored. Scoring a
 * market on yesterday's prices would be silently wrong in exactly the way a
 * ranking cannot afford.
 *
 * Runs inside `runAsSystem`: the tables it reads and writes are market-level
 * reference data with no owner, and there is no user whose context this
 * belongs in.
 *
 * Never throws into the scheduler. A scoring failure means the engine falls
 * back to category-level advice — which is a degraded service, not an
 * outage — so it is logged and the process stays up.
 */

import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { env } from '../config/env.js';
import {
  currentMethodology,
  ensureSignedMethodology,
} from '../services/advisor/fundRanking/methodology.service.js';
import {
  CalendarIntegrityError,
  runFundScoring,
} from '../services/advisor/fundRanking/scoringRun.service.js';
import { refreshFundCostAndSize } from '../priceFeeds/amfiCostAndSize.service.js';

const TZ = 'Asia/Kolkata';

/** Guards against a slow run overlapping the next tick. The job is idempotent,
 *  so an overlap would be survivable, but two full market passes at once is a
 *  waste of a database. */
let running = false;

export async function runFundScoringJob(asOf: Date = new Date()): Promise<void> {
  if (running) {
    logger.warn('[fundScoring] previous run still in progress, skipping this tick');
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    await runAsSystem(async () => {
      await ensureSignedMethodology();
      const methodology = await currentMethodology();
      if (!methodology) {
        // Expected on any deployment that has not turned named-fund advice on.
        // Recorded rather than silent so "why are there no scores?" is
        // answerable from the logs.
        logger.info(
          '[fundScoring] no signed methodology — skipping. Named-fund advice stays off until one is signed.',
        );
        return;
      }

      // Cost and size first: the scoring pass reads terPct and aumInr, and
      // scoring yesterday's cost against today's NAVs would rank funds on a
      // mixture of two days. A failure here is recorded and does not stop the
      // scoring — yesterday's TER is worth more than no ranking at all, and
      // the release gate is what stops coverage quietly rotting.
      const costAndSize = await refreshFundCostAndSize();
      logger.info(
        {
          terMatched: costAndSize.ter.matched,
          terUnmatched: costAndSize.ter.unmatched,
          terAsOf: costAndSize.ter.asOf,
          aumMatched: costAndSize.aum.matched,
          aumAmcs: costAndSize.aum.amcs,
          aumAsOf: costAndSize.aum.asOf,
          failures: costAndSize.failures.length,
        },
        '[fundScoring] AMFI cost and size refreshed',
      );
      for (const failure of costAndSize.failures.slice(0, 5)) {
        logger.warn(failure, '[fundScoring] cost/size source failed');
      }

      const result = await runFundScoring({
        methodologyVersionId: methodology.id,
        config: methodology.config,
        asOf,
      });
      logger.info(
        {
          asOfDate: result.asOfDate.toISOString().slice(0, 10),
          methodologyVersion: methodology.version,
          schemesConsidered: result.schemesConsidered,
          snapshotsWritten: result.snapshotsWritten,
          failures: result.failures,
          ms: Date.now() - startedAt,
        },
        '[fundScoring] run complete',
      );
    });
  } catch (err) {
    if (err instanceof CalendarIntegrityError) {
      // Already recorded in ScoringRunLog, already sent to Sentry, already
      // logged with the gap span. Logged once more here at warn, without the
      // stack, so the job's own timeline reads straight: a refusal is a
      // decision this job made, not an error it hit.
      logger.warn(
        { runId: err.runId, reason: err.reason, ms: Date.now() - startedAt },
        '[fundScoring] refused to score — the previous snapshot stands until it ages out',
      );
    } else {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        '[fundScoring] run failed — advice falls back to category level',
      );
    }
  } finally {
    running = false;
  }
}

export function startFundScoringJob(): void {
  if (env.RIA_VERDICTS_ENABLED !== 'true') {
    logger.info('[fundScoring] RIA_VERDICTS_ENABLED is off — nightly scoring not scheduled');
    return;
  }
  // 22:30 IST: after AMFI NAV (22:00), before the net-worth snapshot (23:45).
  cron.schedule('30 22 * * *', () => void runFundScoringJob(), { timezone: TZ });
  logger.info('[fundScoring] nightly scoring scheduled for 22:30 IST');
}
