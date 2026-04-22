/**
 * §7.6 Vehicle cron jobs.
 *
 * Two schedules:
 *
 *   - Daily @ 02:15 IST: every Vehicle whose `lastRefreshedAt` is
 *     older than 7 days → run the adapter chain in AUTO mode. Only
 *     `supportsAuto: true` adapters fire (mParivahan). Portal and SMS
 *     are skipped because they need human interaction.
 *
 *   - Monthly @ 03:00 IST on the 1st: every Vehicle gets a challan
 *     scan. Even though the challan adapter is technically interactive
 *     (OTP), we run it here so the attempts + DLQ surface on
 *     /imports/failures and the user can resolve via the "Check
 *     challans" button on the detail page.
 *
 * Both jobs wrap in `runAsSystem` — they traverse every tenant, so RLS
 * must be bypassed per §5.1 task 11.
 */

import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { refreshVehicle } from '../services/vehicles.service.js';
import { scanChallansMonthlyForAllActiveVehicles } from '../services/challans.service.js';

const TZ = 'Asia/Kolkata';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const running = {
  weeklyRefresh: false,
  monthlyChallan: false,
};

interface WeeklyRefreshOutcome {
  scanned: number;
  refreshed: number;
  noData: number;
  errors: number;
}

export async function runWeeklyVehicleRefresh(): Promise<WeeklyRefreshOutcome> {
  if (running.weeklyRefresh) {
    logger.warn('[cron] weekly vehicle refresh already running — skipping');
    return { scanned: 0, refreshed: 0, noData: 0, errors: 0 };
  }
  running.weeklyRefresh = true;
  const t0 = Date.now();
  try {
    return await runAsSystem(async () => {
      const cutoff = new Date(Date.now() - WEEK_MS);
      const vehicles = await prisma.vehicle.findMany({
        where: {
          OR: [
            { lastRefreshedAt: null },
            { lastRefreshedAt: { lt: cutoff } },
          ],
        },
        select: { id: true, userId: true, registrationNo: true },
      });
      let refreshed = 0;
      let noData = 0;
      let errors = 0;
      for (const v of vehicles) {
        try {
          const { outcome } = await refreshVehicle(v.userId, v.id, {
            mode: 'auto',
          });
          if (outcome.ok) refreshed += 1;
          else noData += 1;
        } catch (err) {
          errors += 1;
          logger.warn(
            { err, vehicleId: v.id, regNo: v.registrationNo },
            '[cron] weekly refresh threw for vehicle',
          );
        }
      }
      logger.info(
        { scanned: vehicles.length, refreshed, noData, errors, ms: Date.now() - t0 },
        '[cron] weekly vehicle refresh done',
      );
      return { scanned: vehicles.length, refreshed, noData, errors };
    });
  } finally {
    running.weeklyRefresh = false;
  }
}

export async function runMonthlyChallanScan() {
  if (running.monthlyChallan) {
    logger.warn('[cron] monthly challan scan already running — skipping');
    return;
  }
  running.monthlyChallan = true;
  const t0 = Date.now();
  try {
    const summary = await scanChallansMonthlyForAllActiveVehicles();
    logger.info(
      { ...summary, ms: Date.now() - t0 },
      '[cron] monthly challan scan done',
    );
    return summary;
  } catch (err) {
    logger.error({ err }, '[cron] monthly challan scan failed');
  } finally {
    running.monthlyChallan = false;
  }
}

export function startVehicleJobs(): void {
  if (process.env.ENABLE_VEHICLE_CRONS === 'false') {
    logger.info('[cron] vehicle jobs disabled via ENABLE_VEHICLE_CRONS=false');
    return;
  }

  // Daily 02:15 IST (quiet window, after AMFI 22:00 and commodity 23:30)
  cron.schedule('15 2 * * *', () => void runWeeklyVehicleRefresh(), {
    timezone: TZ,
  });

  // 1st of month, 03:00 IST
  cron.schedule('0 3 1 * *', () => void runMonthlyChallanScan(), {
    timezone: TZ,
  });

  logger.info(
    '[cron] scheduled: vehicle weekly-refresh daily @02:15, challan scan monthly 1st @03:00 — IST',
  );
}
