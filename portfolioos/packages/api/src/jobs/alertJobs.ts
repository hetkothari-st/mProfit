import cron from 'node-cron';
import pino from 'pino';
import { runAllAlertScans } from '../services/alerts.service.js';

const logger = pino({ name: 'alertJobs' });

async function runAlertScanJob() {
  try {
    const result = await runAllAlertScans();
    logger.info(result, '[alerts] daily scan complete');
  } catch (err) {
    logger.error({ err }, '[alerts] daily scan failed');
  }
}

export function startAlertJobs(): void {
  if (process.env.ENABLE_ALERT_CRONS === 'false') return;
  // Daily at 20:45 IST (after insurance renewal cron at 20:30)
  cron.schedule('45 20 * * *', () => void runAlertScanJob(), { timezone: 'Asia/Kolkata' });
  logger.info('[alertJobs] scheduled daily at 20:45 IST');
}
