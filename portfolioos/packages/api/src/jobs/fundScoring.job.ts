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
 *
 * It does NOT sign anything, and it does NOT refresh TER/AUM. Signing is an
 * explicit operation a human triggers (`signMethodology`); the cost-and-size
 * refresh is its own nightly feed job with its own canary. This job reads
 * what they left behind and scores it.
 */

import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { env } from '../config/env.js';
import { latestMethodology } from '../services/advisor/fundRanking/methodology.service.js';
import {
  CalendarIntegrityError,
  runFundScoring,
} from '../services/advisor/fundRanking/scoringRun.service.js';

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
      // The LATEST version, signed or not.
      //
      // Scoring used to sign the methodology first, which coupled two
      // unrelated things: computing numbers, and a human taking
      // responsibility for the method behind them. An unlicensed deployment
      // could therefore not compute a single snapshot without also signing —
      // so nobody could look at what production would recommend before
      // deciding whether to stand behind it. Exactly backwards.
      //
      // Computing is a measurement. Only ADVICE needs a signature, and that
      // is enforced where advice is read (advisorFacts.builder), not here.
      const methodology = await latestMethodology();
      if (!methodology) {
        logger.info('[fundScoring] no methodology version exists — nothing to score under');
        return;
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
          methodologySigned: methodology.signed,
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
      // Already recorded in FeedRunLog (kind SCORING), already sent to
      // Sentry, already logged with the gap span. Logged once more here at
      // warn, without the stack, so the job's own timeline reads straight:
      // a refusal is a decision this job made, not an error it hit.
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
  if (env.ENABLE_FUND_SCORING === 'false') {
    logger.info('[fundScoring] disabled via ENABLE_FUND_SCORING=false');
    return;
  }
  // Scheduled whether or not named-fund advice is switched on. Scores are a
  // measurement of the market, and a deployment that is not licensed to give
  // named advice still wants to see what its own engine would say — which is
  // impossible if the only way to compute a snapshot is to sign for it.
  //
  // 22:45 IST: after the AMFI NAV sync (22:00) and the TER/AUM refresh
  // (22:30), before the net-worth snapshot (23:45).
  cron.schedule('45 22 * * *', () => void runFundScoringJob(), { timezone: TZ });
  logger.info(
    { adviceEnabled: env.RIA_VERDICTS_ENABLED === 'true' },
    '[fundScoring] nightly scoring scheduled for 22:45 IST (advice still requires a signed methodology)',
  );
}
