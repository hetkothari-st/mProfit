import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { runLegacyTick } from '../services/legacy/runner.service.js';
import { flushOutbox } from '../services/legacy/outbox.service.js';

let running = false;

async function tick(): Promise<void> {
  if (running) { logger.warn('[legacy.cron] previous tick still running — skipping'); return; }
  running = true;
  try {
    logger.info({ out: await runLegacyTick() }, '[legacy.cron] tick done');
  } catch (err) {
    // Cron entrypoint: nothing upstream to rethrow to; tomorrow's tick retries.
    logger.error({ err }, '[legacy.cron] tick failed');
  } finally { running = false; }
}

async function retryOutbox(): Promise<void> {
  if (running) return;
  try {
    await flushOutbox();
  } catch (err) {
    // Cron entrypoint: the next hourly run retries.
    logger.error({ err }, '[legacy.cron] outbox flush failed');
  }
}

/** Daily state tick 10:00 IST; hourly outbox retry at :20. Set ENABLE_LEGACY_CRON=false in test/CI. */
export function startLegacyTransferJob(): void {
  if (process.env.ENABLE_LEGACY_CRON === 'false') return;
  cron.schedule('0 10 * * *', () => void tick(), { timezone: 'Asia/Kolkata' });
  cron.schedule('20 * * * *', () => void retryOutbox(), { timezone: 'Asia/Kolkata' });
  logger.info('[legacy.cron] scheduled (daily 10:00 IST, outbox hourly :20)');
}
