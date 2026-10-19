import type { Server } from 'node:http';
import { logger } from './logger.js';

export interface ShutdownDeps {
  server: Pick<Server, 'close' | 'closeIdleConnections' | 'closeAllConnections'>;
  /** Stop schedulers first, so no new cron tick starts mid-drain. */
  stopSchedulers: () => void;
  closeQueues: () => Promise<void>;
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  /** After this, open keep-alive / SSE / streaming sockets are cut. */
  graceMs?: number;
  /** Absolute ceiling before a forced exit(1). */
  hardMs?: number;
}

/**
 * Graceful shutdown for SIGTERM/SIGINT.
 *
 * `server.close()` alone waits for every open connection, and SSE streams
 * (PF fetch progress) and keep-alive sockets never close by themselves, so the
 * old handler always fell through to its forced exit(1) at 10 s, with crons
 * still firing during the drain. Order here: stop schedulers, stop accepting,
 * drop idle sockets now and the rest after `graceMs`, then close queues (Bull
 * waits for active jobs) and Prisma, and exit 0. `hardMs` still bounds it.
 */
export function createShutdown(deps: ShutdownDeps): (signal: string) => void {
  const graceMs = deps.graceMs ?? 5_000;
  const hardMs = deps.hardMs ?? 10_000;
  let started = false;

  return (signal: string) => {
    if (started) return;
    started = true;
    logger.info(`${signal} received, shutting down gracefully`);

    setTimeout(() => {
      logger.error('shutdown.timeout — forcing exit');
      deps.exit(1);
    }, hardMs).unref();

    try {
      deps.stopSchedulers();
    } catch (err) {
      logger.warn({ err }, 'shutdown.stop_schedulers_failed');
    }

    deps.server.close(() => {
      void (async () => {
        try {
          await deps.closeQueues();
          await deps.disconnect();
          deps.exit(0);
        } catch (err) {
          logger.error({ err }, 'shutdown.cleanup_failed');
          deps.exit(1);
        }
      })();
    });
    deps.server.closeIdleConnections();
    setTimeout(() => deps.server.closeAllConnections(), graceMs).unref();
  };
}
