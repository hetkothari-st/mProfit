/**
 * Daily existing-loan checks (EMI calculator spec s6.3): LOAN_REFINANCE and LOAN_BENCHMARK_CHANGE alerts.
 * Runs right after the 07:30 IST rates job (loanRatesJob.ts runDailyLoanJobs), so it sees today's rates.
 *
 * Context: benchmark changes and the user list are read once under runAsSystem (global tables, and a list
 * of owners across users); every user's loans and alerts are then handled under runAsUser(userId), so RLS
 * confines each step to that user. Single-flight: an overlapping call returns null.
 */
import type { MarketRateWire, RateLoanType } from '@everypaisa/shared';
import { logger } from '../lib/logger.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import { checkUserLoans, eligibleUserIds, findBenchmarkChanges } from '../services/loanChecks/loanAlerts.service.js';
import { bestMarketRate } from '../services/loanChecks/marketCheck.service.js';

export interface LoanChecksOptions {
  now?: Date;
  /** Limit the run to these users (tests, manual re-runs). Default: every eligible user. */
  userIds?: string[];
}

export interface LoanChecksResult {
  users: number;
  refinance: number;
  benchmark: number;
  changes: number;
  failedLoans: number;
  failedUsers: number;
}

let running = false;

export async function runLoanChecks(options: LoanChecksOptions = {}): Promise<LoanChecksResult | null> {
  if (running) {
    logger.warn('[loanChecks] run already in progress - skipping');
    return null;
  }
  running = true;
  try {
    const now = options.now ?? new Date();
    const { changes, userIds } = await runAsSystem(async () => ({
      changes: await findBenchmarkChanges(now),
      userIds: await eligibleUserIds(options.userIds),
    }));
    // One market lookup per loan type per run, shared by every user.
    const cache = new Map<RateLoanType, Promise<MarketRateWire | null>>();
    const market = (type: RateLoanType): Promise<MarketRateWire | null> => {
      let pending = cache.get(type);
      if (pending === undefined) {
        pending = bestMarketRate(type, now);
        cache.set(type, pending);
      }
      return pending;
    };
    const result: LoanChecksResult = { users: userIds.length, refinance: 0, benchmark: 0, changes: changes.length, failedLoans: 0, failedUsers: 0 };
    for (const userId of userIds) {
      try {
        const r = await runAsUser(userId, () => checkUserLoans(userId, { now, changes, market }));
        result.refinance += r.refinance;
        result.benchmark += r.benchmark;
        result.failedLoans += r.failedLoans;
      } catch (err) {
        // One user's failure (e.g. a transient DB error) must not stop everyone else's alerts; counted and logged.
        result.failedUsers++;
        logger.error({ err, userId }, '[loanChecks] user skipped');
      }
    }
    return result;
  } finally {
    running = false;
  }
}

/** Cron entry point (via runDailyLoanJobs). */
export async function runLoanChecksJob(): Promise<LoanChecksResult | null> {
  try {
    const result = await runLoanChecks();
    if (result) logger.info(result, '[cron] loan checks done');
    return result;
  } catch (err) {
    logger.error({ err }, '[cron] loan checks failed');
    throw err;
  }
}
