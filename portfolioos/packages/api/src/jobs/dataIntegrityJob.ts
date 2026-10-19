/**
 * Nightly stored-data integrity check.
 *
 * For every portfolio, recompute holdings and capital gains from the
 * transactions alone and compare with what is stored
 * (services/integrity/storedDataIntegrity.service.ts). Anything that drifted is
 * rebuilt from the transactions, the run is logged to `DataIntegrityRun`, and
 * a drift or a failure raises one admin alert.
 *
 * Why repair rather than only report: the stored rows are a cache of a pure
 * function of the transactions, so when they disagree the cache is wrong by
 * definition and rebuilding it loses nothing. Why still alert: a drift means
 * some write path skipped its recompute, and that path will keep doing it
 * until someone finds it. `details` names the portfolio and asset so they can.
 *
 * Failed imports and emails are retried first (ingestionRecovery.service).
 *
 * Runs at 02:15 IST — after the evening price jobs and the 23:45 net-worth
 * snapshot, before anyone opens a report in the morning.
 */

import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import {
  checkPortfolioIntegrity,
  type PortfolioIntegrityResult,
} from '../services/integrity/storedDataIntegrity.service.js';
import { runIngestionRecovery } from '../services/imports/ingestionRecovery.service.js';

const TZ = 'Asia/Kolkata';
export const DATA_INTEGRITY_ALERT_SOURCE = 'data.integrity';

/** Cap on per-portfolio detail kept in a run row; the counts stay exact. */
const MAX_DETAIL_ENTRIES = 200;

let running = false;

export interface DataIntegrityRunSummary {
  runId: string;
  portfoliosChecked: number;
  holdingDrifts: number;
  gainDrifts: number;
  portfoliosRepaired: number;
  failures: number;
}

export async function runDataIntegrityJob(opts: { repair?: boolean } = {}): Promise<DataIntegrityRunSummary | null> {
  if (running) {
    logger.warn('[cron] data integrity job already running — skipping');
    return null;
  }
  running = true;
  const repair = opts.repair ?? true;
  try {
    // Heal ingestion first: a recovered import changes the transactions the
    // integrity check below compares against.
    try {
      const recovery = await runIngestionRecovery();
      logger.info(recovery, '[cron] ingestion recovery done');
    } catch (err) {
      logger.error({ err }, '[cron] ingestion recovery failed');
    }
    const run = await runAsSystem(() => prisma.dataIntegrityRun.create({ data: {} }));
    const portfolios = await runAsSystem(() =>
      prisma.portfolio.findMany({
        where: { user: { isActive: true } },
        select: { id: true, userId: true },
      }),
    );

    let holdingDrifts = 0;
    let gainDrifts = 0;
    let portfoliosRepaired = 0;
    let failures = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const p of portfolios) {
      let result: PortfolioIntegrityResult;
      try {
        result = await runAsUser(p.userId, () => checkPortfolioIntegrity(p.id, { repair }));
      } catch (err) {
        failures++;
        logger.error({ err, portfolioId: p.id }, '[cron] data integrity check failed for portfolio');
        if (details.length < MAX_DETAIL_ENTRIES) {
          details.push({ portfolioId: p.id, error: (err as Error).message });
        }
        continue;
      }
      const gainCount = result.gainDrift.missing + result.gainDrift.unexpected;
      holdingDrifts += result.holdingDrifts.length;
      gainDrifts += gainCount;
      if (result.repaired) portfoliosRepaired++;
      if ((result.holdingDrifts.length > 0 || gainCount > 0) && details.length < MAX_DETAIL_ENTRIES) {
        details.push({
          portfolioId: p.id,
          holdings: result.holdingDrifts,
          gains: result.gainDrift,
          repaired: result.repaired,
        });
      }
    }

    const summary = {
      portfoliosChecked: portfolios.length,
      holdingDrifts,
      gainDrifts,
      portfoliosRepaired,
      failures,
    };
    await runAsSystem(() =>
      prisma.dataIntegrityRun.update({
        where: { id: run.id },
        data: { ...summary, finishedAt: new Date(), details: details as object[] },
      }),
    );

    if (holdingDrifts > 0 || gainDrifts > 0 || failures > 0) {
      await raiseAdminAlert(run.id, summary);
      logger.warn({ runId: run.id, ...summary }, '[cron] data integrity drift found');
    } else {
      logger.info({ runId: run.id, ...summary }, '[cron] data integrity check clean');
    }
    return { runId: run.id, ...summary };
  } finally {
    running = false;
  }
}

/**
 * One alert per run, to the oldest active admin (the ops-alert convention in
 * mfOpsAlertsJob). Per-asset detail lives on the run row, not in the alert.
 */
async function raiseAdminAlert(
  runId: string,
  s: Omit<DataIntegrityRunSummary, 'runId'>,
): Promise<void> {
  await runAsSystem(async () => {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      logger.error({ runId, ...s }, '[cron] data integrity drift found (no ADMIN user to alert)');
      return;
    }
    const parts = [
      s.holdingDrifts > 0 ? `${s.holdingDrifts} holding row(s) out of step with transactions` : null,
      s.gainDrifts > 0 ? `${s.gainDrifts} capital-gain row(s) out of step` : null,
      s.failures > 0 ? `${s.failures} portfolio(s) could not be checked` : null,
    ].filter(Boolean);
    await prisma.alert.create({
      data: {
        userId: admin.id,
        type: 'CUSTOM',
        title: 'Data integrity: stored figures drifted',
        description:
          `${parts.join('; ')}. ${s.portfoliosRepaired} portfolio(s) were rebuilt from their transactions. ` +
          `A write path is skipping its recompute — see DataIntegrityRun ${runId} for the assets.`,
        triggerDate: new Date(),
        metadata: { source: DATA_INTEGRITY_ALERT_SOURCE, runId, ...s },
      },
    });
  });
}

export function startDataIntegrityJob(): void {
  if (process.env.ENABLE_DATA_INTEGRITY_CRON === 'false') {
    logger.info('[cron] data integrity job disabled via ENABLE_DATA_INTEGRITY_CRON=false');
    return;
  }
  cron.schedule(
    '15 2 * * *',
    () => {
      runDataIntegrityJob().catch((err) => logger.error({ err }, '[cron] data integrity job failed'));
    },
    { timezone: TZ },
  );
  logger.info('[cron] scheduled: data integrity check @02:15 IST');
}
