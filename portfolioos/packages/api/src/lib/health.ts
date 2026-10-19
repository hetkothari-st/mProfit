import type { Request, Response } from 'express';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

const READY_TIMEOUT_MS = 2_000;

export type ReadinessProbe = () => Promise<unknown>;

const dbProbe: ReadinessProbe = () => prisma.$queryRaw`SELECT 1`;

/**
 * Readiness: can this instance serve a real request, i.e. reach Postgres?
 *
 * `/health` only proves the process is up. Railway's deploy healthcheck points
 * here instead, so a deploy that cannot reach the database is never switched
 * to — the old container keeps serving. Redis is deliberately not checked:
 * everything that needs it degrades (rate-limit fallback, bounded enqueue), so
 * a Redis outage must not block a deploy or take an instance out of rotation.
 */
export async function checkReadiness(
  probe: ReadinessProbe = dbProbe,
  timeoutMs = READY_TIMEOUT_MS,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<{ ok: false; reason: string }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: 'database timeout' }), timeoutMs);
  });
  try {
    return await Promise.race([
      probe().then(
        () => ({ ok: true }) as const,
        (err: unknown) => {
          logger.warn({ err }, 'readiness.db_failed');
          return { ok: false, reason: 'database unreachable' } as const;
        },
      ),
      timedOut,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function makeReadyHandler(probe?: ReadinessProbe, timeoutMs?: number) {
  return async (_req: Request, res: Response): Promise<void> => {
    const r = await checkReadiness(probe, timeoutMs);
    if (r.ok) {
      res.json({ success: true, data: { status: 'ready' } });
      return;
    }
    res.status(503).json({ success: false, error: r.reason, code: 'NOT_READY' });
  };
}
