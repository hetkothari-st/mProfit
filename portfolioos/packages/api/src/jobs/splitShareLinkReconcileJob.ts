import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { reconcileAllShareLinks } from '../services/split/shareLink.service.js';

let running = false;
async function run(): Promise<void> {
  if (running) { logger.warn('[split] share-link reconcile already running'); return; }
  running = true;
  try {
    const r = await reconcileAllShareLinks();
    logger.info(r, '[split] share-link reconcile done');
  } catch (err) {
    // Cron entrypoint: nothing upstream to rethrow to; the next nightly run retries.
    logger.error({ err }, '[split] share-link reconcile failed');
  } finally {
    running = false;
  }
}

export function startSplitShareLinkReconcileJob(): void {
  if (process.env.ENABLE_SPLIT_SHARELINK_RECONCILE_CRON === 'false') return;
  cron.schedule('30 2 * * *', () => void run(), { timezone: 'Asia/Kolkata' });
}
