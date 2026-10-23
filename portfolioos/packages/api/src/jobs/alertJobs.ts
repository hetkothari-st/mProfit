import cron from 'node-cron';
import pino from 'pino';
import { prisma } from '../lib/prisma.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import { runAllAlertScans } from '../services/notifications/alerts.service.js';

const logger = pino({ name: 'alertJobs' });

interface AlertScanDeps {
  listUserIds: () => Promise<string[]>;
  scan: (userId: string) => Promise<unknown>;
}

const defaultDeps: AlertScanDeps = {
  listUserIds: async () => (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id),
  scan: (userId) => runAllAlertScans(userId),
};

/**
 * Context: the user list is read under runAsSystem; each user's scan then runs
 * under runAsUser(userId). Without a context row-level security returns zero
 * rows, so the scan used to find nothing and create no alerts. One user's
 * failure is logged and the rest still run.
 */
export async function runAlertScanJob(deps: AlertScanDeps = defaultDeps): Promise<void> {
  let userIds: string[];
  try {
    userIds = await runAsSystem(() => deps.listUserIds());
  } catch (err) {
    logger.error({ err }, '[alerts] daily scan failed to list users');
    return;
  }
  let failed = 0;
  for (const userId of userIds) {
    try {
      await runAsUser(userId, () => deps.scan(userId));
    } catch (err) {
      failed++;
      logger.error({ err, userId }, '[alerts] daily scan failed for user');
    }
  }
  logger.info({ users: userIds.length, failed }, '[alerts] daily scan complete');
}

export function startAlertJobs(): void {
  if (process.env.ENABLE_ALERT_CRONS === 'false') return;
  // Daily at 20:45 IST (after insurance renewal cron at 20:30)
  cron.schedule('45 20 * * *', () => void runAlertScanJob(), { timezone: 'Asia/Kolkata' });
  logger.info('[alertJobs] scheduled daily at 20:45 IST');
}
